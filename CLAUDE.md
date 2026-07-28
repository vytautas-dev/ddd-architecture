# CLAUDE.md

## Project Goal

**BidFlow** is an educational auction platform. The primary goal is teaching the user software architecture step by step, focusing on:

1. **DDD (Domain-Driven Design)** — aggregates, value objects, entities, bounded contexts, domain events
2. **Event Sourcing** — state reconstructed from events, event store, optimistic concurrency
3. **CQRS** — separating Command Model and Query Model
4. **Read Models / Projections** — projections built asynchronously from domain events

Full domain and architecture description: `PLAN.md`

---

## Assistant Role

You are an experienced backend developer teaching the user architecture. This means:

- **Teach step by step** — tell the user exactly what to do next, one step at a time
- **Explain "why" briefly before "how"** — a short explanation before the code
- **Name the pattern** — when writing code, call out the pattern being used ("this is a Value Object because...")
- **Don't skip ahead** — don't implement things from future stages while the current stage is unfinished
- **Write tests** — every domain concept gets a unit test

The user learns by doing. Give clear instructions, let them implement, answer questions when they get stuck.

---

## Coding Rules

### Architecture
- **Domain layer (domain/) is pure** — zero imports from Express, Prisma, or any framework
- **Dependencies point inward** — infrastructure knows domain, domain does not know infrastructure (Dependency Inversion)
- **Aggregate is the only entry point** for state mutation — never modify entity state directly from outside the aggregate
- **Repositories are interfaces in domain/** — Prisma implementations live in infrastructure/

### Event Sourcing
- Aggregate **does not write to the database directly** — it generates a list of Domain Events
- Aggregate state is reconstructed by **applying events in order** (via an `apply` method)
- Event Store records events with a **version number** (for optimistic concurrency)
- **Events are immutable** — never modify a saved event

### CQRS
- **Command Handler** takes a command, loads the aggregate from repository, calls a domain method, saves events
- **Query Handler** reads from a Read Model (denormalized table), never from the event store
- Commands and queries have **separate classes** — no single "service" that does both

### General
- TypeScript strict mode throughout
- Zod for validation at system boundaries (API layer, not domain)
- Unit tests for domain — no database, pure classes only
- Domain errors as typed classes (`AuctionNotFoundError`, `BidTooLowError`) — never throw generic `Error`

---

## Tech Stack

```
Node.js + TypeScript (strict)
Express.js       — HTTP layer (thin, delegates to application layer)
PostgreSQL        — database
Prisma           — ORM (infrastructure layer only)
Zod              — schema validation (input validation at boundaries)
Jest + ts-jest   — tests
uuid             — ID generation
```

---

## Project Structure

```
src/
├── auction/            # Bounded Context: Auction (core domain)
│   ├── domain/         # Pure domain logic
│   ├── application/    # Command & Query Handlers
│   ├── infrastructure/ # Prisma, EventStore, Projections
│   └── api/            # Express Router
├── identity/           # Bounded Context: Identity (users)
├── shared/             # Types and utilities shared across contexts
└── index.ts            # Application bootstrap
```

---

## Current Stage

**Wymaganie 1 — "favorite upcoming auctions" — COMPLETE** (plan: `WYMAGANIE_1_ULUBIONE_PLAN.md`). Stages 1–4 effectively covered:

- **DDD** — two bounded contexts: `Auction` and `Watchlist` (aggregate `Watchlist`, streamId = bidderId).
- **Event Sourcing** — event store generalized into `shared/`, projections registered per `streamType` ("auction", "watchlist").
- **CQRS** — commands (favorite/unfavorite/start) separated from queries (read from denormalized views only).
- **Read Models / Projections** — `ActiveAuctionsProjection` (Auction) + `AuctionCatalogProjection` and `FavoritesProjection` (Watchlist). `AuctionCatalogProjection` is the single consumer of another context's events; `FavoritesProjection` is Watchlist-only.

**Concurrency control — DONE.** Optimistic concurrency is fully wired in both contexts: the aggregate keeps `persistedVersion` (the version at load time), the event store enforces `@@unique([streamId, version])`, and a `P2002` conflict surfaces as `OptimisticConcurrencyError`. On top of that, a **retry** behavior replays the whole command against fresh state on conflict. Retry is applied declaratively as a **decorator** at wiring time — `withBehaviors(handler, { retry: true })` in `index.ts` — so handlers stay pure (no retry boilerplate inside them). All mutating commands (place-bid/cancel/start/favorite/unfavorite) run under `{ retry: true }`; `CreateAuction` opens a fresh stream so it needs none. Reusable pieces live in `shared/application/` (`CommandHandler`, `withBehaviors`, `retryOnConcurrencyConflict`).

**Transactions (atomicity) — DONE.** Events + projections now commit atomically via the **Unit of Work** pattern: `PrismaUnitOfWork` (`shared/infrastructure/`) carries the Prisma transaction client through the async call chain with `AsyncLocalStorage`, so `EventStore`, projections, and handlers read `uow.client` (tx inside `uow.run()`, singleton fallback outside) without any signature changes. The `IUnitOfWork` port lives in `shared/application/` (Dependency Inversion). Wired declaratively: `withBehaviors(handler, { retry: true, transaction: uow })` — retry wraps transaction (each attempt gets a fresh tx). All mutating commands run transactionally, including `CreateAuction` (transaction only, no retry). Atomicity is proven by `shared/infrastructure/__tests__/atomicity.integration.test.ts` (failing projection → event rolled back); jest runs with `maxWorkers: 1` because integration test files share one DB and TRUNCATE it.

**Cross-context read model ownership — DONE.** The Watchlist no longer reads the Auction context's `active_auctions_view`. It owns `watchlist_auction_catalog_view`, built by `AuctionCatalogProjection` from `streamType: "auction"` events — the contract between contexts is the **Published Language** (events), never another context's tables. Unlike the Auction view it **never deletes**: `Closed`/`Cancelled` are status updates, which fixed a bug where a cancelled auction surfaced as `AuctionToFavoriteNotFoundError` (404) instead of `AuctionNotUpcomingError` (422). `IAuctionCatalog` is a true **Anti-Corruption Layer**: it translates vocabulary (`{ exists, status: SCHEDULED|... }` → `{ exists, isUpcoming }`), so the aggregate keeps the *rule* while the ACL owns the *translation*. Rule of thumb established: query side (no domain decision) reads the view directly with no port; command side (value feeds an aggregate decision) goes through a port + ACL. Details and the rebuild-strategy research in `JOURNAL.md` (2026-07-28).

**Read/write split of the favorites view — DONE.** `favorites_view` is now `(bidderId, auctionId, favoritedAt)` with an FK to the catalog; auction attributes are joined at query time in `GetMyFavorites` (filter and order go through the relation, DTO and API contract unchanged). Consequences: `FavoritesProjection` lost the catalog lookup and four Auction event cases, so it **no longer subscribes to Auction events at all** — every cross-context subscription now lives in `AuctionCatalogProjection`, one seam instead of two. Write fan-out is gone: `BidPlaced` updates one catalog row instead of every watcher's row. Price paid knowingly: the `(bidderId, startsAt, auctionId)` covering index is unrecoverable (`startsAt` moved tables), so reads are a join with an order-by on the joined column — fine at tens of favorites per user, the trigger for keyset pagination at tens of thousands. The FK now enforces "cannot favorite an auction missing from the catalog"; **it must be revisited before projections go async** (`relationMode = "prisma"` or an ordering guarantee).

Parked: replay/rebuild for new projections (returns naturally with checkpoints); async projections (catch-up subscription + checkpoints — would replace transactional projections with eventual consistency; needs retry + dead-letter for failing projections, and a decision on the `favorites_view` FK); keyset pagination for `GetMyFavorites`; unit test for `AuctionCatalogProjection`; wiring duplicated between `index.ts` and `favorites.integration.test.ts`; integration tests TRUNCATE the **dev** database (a separate `DATABASE_URL_TEST` is the next cleanup); no compose file in the repo; `prisma migrate dev` does not regenerate the client (needs a separate `prisma generate`). `X-User-Id` is a placeholder for a future Identity context.

Update this section when a stage is completed.

---

## Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| Aggregate | PascalCase class | `Auction` |
| Value Object | PascalCase class | `Money`, `BidAmount` |
| Domain Event | PascalCase + Event suffix | `BidPlacedEvent` |
| Command | PascalCase + Command suffix | `PlaceBidCommand` |
| Command Handler | PascalCase + Handler suffix | `PlaceBidHandler` |
| Query | PascalCase + Query suffix | `GetAuctionDetailQuery` |
| Repository interface | `I` prefix + PascalCase + Repository | `IAuctionRepository` |
| Repository implementation | PascalCase + Repository | `PrismaAuctionRepository` |

---

## Anti-patterns to Avoid

- **Anemic Domain Model** — domain classes with only getters/setters, business logic in services
- **Fat Repository** — business logic inside repository methods
- **Infrastructure leaking into domain** — importing Prisma in domain/
- **Premature abstraction** — creating base classes "for the future"
- **God Service** — one service class that handles everything for a given context