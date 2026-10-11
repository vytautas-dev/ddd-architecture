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
- **Event Sourcing** — event store generalized into `shared/`; each `streamType` ("auction", "watchlist") has its own Pulsar topic, and each projection its own subscription on it (see the Pulsar pipeline below).
- **CQRS** — commands (favorite/unfavorite/start) separated from queries (read from denormalized views only).
- **Read Models / Projections** — `ActiveAuctionsProjection` (Auction) + `AuctionCatalogProjection` and `FavoritesProjection` (Watchlist). `AuctionCatalogProjection` is the single consumer of another context's events; `FavoritesProjection` is Watchlist-only.

**Concurrency control — DONE.** Optimistic concurrency is fully wired in both contexts: the aggregate keeps `persistedVersion` (the version at load time), the event store enforces `@@unique([streamId, version])`, and a unique violation (`23505`) surfaces as `OptimisticConcurrencyError`. On top of that, a **retry** behavior replays the whole command against fresh state on conflict. Retry is applied declaratively as a **decorator** at wiring time — `withBehaviors(handler, { retry: true })` in `index.ts` — so handlers stay pure (no retry boilerplate inside them). All mutating commands (place-bid/cancel/start/favorite/unfavorite) run under `{ retry: true }`; `CreateAuction` opens a fresh stream so it needs none. Reusable pieces live in `shared/application/` (`CommandHandler`, `withBehaviors`, `retryOnConcurrencyConflict`).

**Transactions (atomicity) — DONE.** A command's events and its outbox rows commit atomically via the **Unit of Work** pattern: `PostgresUnitOfWork` (`shared/infrastructure/`, Postgres.js) carries the transaction through the async call chain with `AsyncLocalStorage`, so `EventStore` and handlers read `uow.client` without signature changes. The `IUnitOfWork` port lives in `shared/application/` (Dependency Inversion). Wired declaratively: `withBehaviors(handler, { retry: true, transaction: commandUow })` — retry wraps transaction (each attempt gets a fresh tx). All mutating commands run transactionally, including `CreateAuction` (transaction only, no retry). Projections are **not** in the command transaction any more: on the read side `PrismaUnitOfWork` wraps each projection write together with its ledger advance (see the Pulsar pipeline below). Jest runs with `maxWorkers: 1` because test files share one Postgres and one Pulsar (subscriptions).

**Cross-context read model ownership — DONE.** The Watchlist no longer reads the Auction context's `active_auctions_view`. It owns `watchlist_auction_catalog_view`, built by `AuctionCatalogProjection` from `streamType: "auction"` events — the contract between contexts is the **Published Language** (events), never another context's tables. Unlike the Auction view it **never deletes**: `Closed`/`Cancelled` are status updates, which fixed a bug where a cancelled auction surfaced as `AuctionToFavoriteNotFoundError` (404) instead of `AuctionNotUpcomingError` (422). `IAuctionCatalog` is a true **Anti-Corruption Layer**: it translates vocabulary (`{ exists, status: SCHEDULED|... }` → `{ exists, isUpcoming }`), so the aggregate keeps the *rule* while the ACL owns the *translation*. Rule of thumb established: query side (no domain decision) reads the view directly with no port; command side (value feeds an aggregate decision) goes through a port + ACL. Details and the rebuild-strategy research in `JOURNAL.md` (2026-07-28).

**Read/write split of the favorites view — DONE.** `favorites_view` is now `(bidderId, auctionId, favoritedAt)`; auction attributes are joined at query time in `GetMyFavorites` (filter and order go through the relation, DTO and API contract unchanged). Consequences: `FavoritesProjection` lost the catalog lookup and four Auction event cases, so it **no longer subscribes to Auction events at all** — every cross-context subscription now lives in `AuctionCatalogProjection`, one seam instead of two. Write fan-out is gone: `BidPlaced` updates one catalog row instead of every watcher's row. Price paid knowingly: the `(bidderId, startsAt, auctionId)` covering index is unrecoverable (`startsAt` moved tables), so reads are a join with an order-by on the joined column — fine at tens of favorites per user, the trigger for keyset pagination at tens of thousands. The FK to the catalog was **dropped** in step 3B (`relationMode = "prisma"`, Prisma relation and join unchanged): separate subscriptions have no cross-topic order, so a favorite may briefly precede its catalog row — `GetMyFavorites` hides such rows until the catalog catches up.

**Test database isolation — DONE.** Integration tests never touch the dev database: `npm test` starts a disposable Postgres (`wal_level=logical`) and Apache Pulsar 4.0 standalone with Testcontainers, once per run (`jest.globalSetup.ts`), applies migrations with `prisma migrate deploy`, and points `DATABASE_URL` / `PULSAR_URL` at them before any test module is imported. `jest.setup.ts` refuses to run if the containers are not up, so a test can never fall back to `.env`. Tests isolate by unique ids — nothing `TRUNCATE`s. Docker must be running.

**Idempotent projections — DONE.** Every projection now converges when the same event is applied twice, which is the precondition for any redelivery (Pulsar redelivery after a nack, `dlq:replay`, a future rebuild). Translation applied throughout: `create` → `upsert`, `update` → `updateMany`, `delete` → `deleteMany` (Prisma's idiom for "…if it exists" — `update` throws `P2025` on zero matches), and the one relative write, `totalBids: { increment: 1 }`, became an absolute `totalBids: e.bidNumber`. That required enriching `BidPlacedEvent` with `bidNumber`, fed by a new `Auction.bidCount` incremented **only in `apply`** (so the write path and `reconstitute` agree); `cancel()` now states its rule as `bidCount > 0`. Rejected alternatives: a per-row `lastVersion` dedup marker (needed event metadata in `IProjection.handle`, which only arrived in step 3B — and there a per-stream ledger replaced it, because a per-row marker drops older events that touch other columns) and relying on checkpoint-in-the-same-transaction (holds only until the first rebuild without TRUNCATE). A missing row (`count === 0`) is logged as a warning by `reportMissingRow`, not dead-lettered: with the stream version ledger events arrive in stream order, so it signals a real anomaly. Details in `JOURNAL.md` (2026-08-20, 2026-10-11).

**Event-driven read models via Pulsar — DONE** (step 3B; ADR-0001, spec #5, tickets #7–#15; details in `JOURNAL.md` 2026-10-11). The polling `CatchUpSubscription`, `projection_checkpoints` and `event_store.position` are gone.
- **Outbox:** `OutboxEventStore` appends to `event_store` and queues the envelope `{ streamType, streamId, version, eventType, payload }` into the Hermes outbox (`@chassisjs/hermes-postgresql`, pinned to `1.0.0-alpha.16`, tables in the `hermes` schema) in the same transaction. `event_store` stays the source of truth; Pulsar is transport only.
- **Relay in the API:** `npm run dev` runs Express plus Hermes, which reads the outbox through logical replication (`wal_level=logical`, commit order — no gap trap) and publishes to Pulsar 4.0 (`auction-events`, `watchlist-events`; key = `streamId`). Before publishing, the API provisions every projection subscription and each DLQ's `replay` subscription (`provisionSubscriptions`), so nothing published before the worker's first run is lost. **Single instance**: Hermes holds the replication slot.
- **Worker:** `npm run worker` (`src/worker.ts`), scalable. One `Key_Shared` subscription per projection (`active-auctions`, `watchlist-auction-catalog`, `watchlist-favorites`). Each message is validated with the publishing context's Zod schema (`parseEnvelope`; Dates revived, malformed → DLQ), then `StreamOrderedProjection` applies it under the **stream version ledger** (`projection_stream_versions`): next version → apply + compare-and-set advance in one Prisma transaction; old → duplicate, ack; gap → nack. `IProjection.handle(event, { streamId, version })`.
- **Failures:** nack → redelivered after 1 s, at most 10 times → `<topic>-<subscription>-DLQ`. A poison event freezes only its stream in its projection. `npm run dlq:replay -- <subscription>` sends dead letters back; other views drop the copies as duplicates.
- **Monitoring:** `npm run projections:status [-- --frozen-after <s>]` lists streams whose ledger is behind `max(version)` in `event_store` and flags those waiting past the threshold as frozen. Dekaf (Pulsar UI) on `:8090` in `docker-compose.yml`.
- **Hermes is patched** (`patches/…alpha.16.patch`, `patch-package` on `postinstall`): its acknowledge could drop the next transaction's inserts under concurrent commits. Found by the two-worker scenario; not reported upstream. Remove the patch once a fixed version ships. Jest needs `forceExit` (Hermes passes ms where postgres.js expects seconds).

Carried-forward debts: Watchlist consumes Auction's **domain** events directly (integration events / public contract — the planned next step); the API is a single instance (way out: one Hermes `partitionKey` + slot per instance); a false 404 when favoriting a just-created auction, because the catalog is eventually consistent (3C); fixed redelivery delay, no backoff; a long transient failure dead-letters healthy streams, which then need a manual `dlq:replay` (`projections:status` shows them); a projection that writes a wrong value without throwing stays wrong — only a rebuild heals it.

Parked: replay/rebuild of read models from history (new projection, rewound subscription); keyset pagination for `GetMyFavorites`; unit test for `AuctionCatalogProjection`; wiring duplicated between `index.ts`/`worker.ts` and the integration tests; `prisma migrate dev` does not regenerate the client (needs a separate `prisma generate`). `X-User-Id` is a placeholder for a future Identity context.

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

---

## Agent skills

AI SDLC flow (grilling → spec → tickets → implementation), see `docs/ai-sdlc-flow.md`. Skills live in `.agents/skills/` (symlinked into `.claude/skills/`), upstream versions pinned in `skills-lock.json`.

### Issue tracker

Specs (PRDs) and tickets live in GitHub Issues: the spec is the parent issue, its tickets are sub-issues. `.scratch/` is local-only working notes, never the publish target. See `docs/agents/issue-tracker.md`.

### Triage labels

See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` at the repo root covering both bounded contexts (a section per context), ADRs in `docs/adr/`, business rules in `ABOUT.md`/`PLAN.md`. See `docs/agents/domain.md`.
