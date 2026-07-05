# BidFlow — Project Overview

## What is this project?

**BidFlow** is an **educational auction platform** written in TypeScript on top of Node.js, Express, PostgreSQL and Prisma. Its primary purpose is not to ship a production product, but to learn — step by step — how to design and implement a backend system using four foundational backend architecture patterns:

1. **Domain-Driven Design (DDD)**
2. **Event Sourcing**
3. **CQRS (Command Query Responsibility Segregation)**
4. **Read Models / Projections**

Every feature is added with the goal of demonstrating one of these patterns in a realistic but minimal setting.

---

## The business domain

The product itself is a simple online auction service. The rules of the domain are:

- A **seller** can list an item for auction by providing a **title**, a **starting price**, an **end date**, and a **start date**.
- An auction created with a start date in the future begins as **`SCHEDULED`** (an *upcoming* auction); one that starts immediately begins as **`ACTIVE`**. A scheduled auction transitions to `ACTIVE` when it is **started**.
- Other users (**bidders**) can place bids on **active** auctions. Bidding on a `SCHEDULED` auction is rejected (`AuctionNotStartedError`).
- A bid is only valid if it is **strictly higher** than the current highest bid (or higher than the starting price if no bids have been placed yet).
- A **seller cannot bid on their own auction**.
- The seller can **cancel** an auction, but **only as long as no bids have been placed**.
- When the end time passes, the auction is **closed**. The highest bidder wins; if there are no bids, the auction closes with no winner.

These rules are enforced inside the `Auction` aggregate (`src/auction/domain/Auction.ts`) and surface to the outside world as typed domain errors (`BidTooLowError`, `SellerCannotBidError`, `CannotCancelAuctionWithBidsError`, `AuctionClosedError`, `AuctionNotStartedError`, `AuctionNotScheduledError`, `AuctionNotFoundError`).

---

## Why this domain?

Auctions are well-suited to teach the target patterns because:

- They have **clear invariants** — perfect for an aggregate (`Auction`) that protects its own consistency.
- They have an obvious **append-only history** — every bid, start, cancellation, and closure is naturally an event, which is exactly what Event Sourcing models.
- Their **read needs differ from their write needs** — placing a bid requires consistency on a single auction; listing active auctions requires a denormalized, query-friendly view. That gap is what CQRS and projections exist to solve.

---

## Bounded contexts

The project is organized as several **bounded contexts**, each living in its own folder under `src/`:

| Context | Role | Status |
|---|---|---|
| **Auction** | Core domain — listings, bidding, starting, cancellation, closing | Implemented |
| **Watchlist** | Supporting domain — a bidder's favorite *upcoming* auctions | Implemented |
| **Identity** | Generic subdomain — users, registration, login | Placeholder (`X-User-Id` header stands in for a real identity) |
| **Notification** | Generic subdomain — notifies users about outbids and wins | Planned |

Two contexts are implemented in depth. The **Watchlist** context (added for the "favorite upcoming auctions" requirement) is deliberately kept separate from **Auction**: an auction does not — and should not — know who favorited it. Watchlist never imports the `Auction` aggregate; when it needs to know an auction's status it reads the auction's **read model**, an **anti-corruption layer (ACL)**.

Code shared across contexts lives in `src/shared/` — the generalized event store, base event/projection interfaces, and application-level cross-cutting behaviors.

---

## Architecture in layers

Inside each bounded context the code is split into four layers, with dependencies pointing **inward** (the outer layers know the inner layers, never the other way around):

```
src/auction/            (and src/watchlist/ mirrors this)
├── domain/         # Pure TypeScript — aggregate, value objects, events, repository interfaces
├── application/    # Use cases: Command Handlers + Query Handlers
├── infrastructure/ # Prisma, Event Store, Projections — the technical implementations
└── api/            # Express router — thin HTTP layer
```

Key architectural rules (enforced by convention, see `CLAUDE.md`):

- The **domain layer is pure** — it has zero imports from Express, Prisma, or any framework.
- The **aggregate is the only entry point** for state mutation — outside code never modifies an entity directly.
- **Repositories are interfaces in `domain/`**, with Prisma-based implementations in `infrastructure/`.
- **Validation happens at boundaries** (the API layer, using Zod) — the domain trusts its inputs.

---

## How the four patterns are wired together

### 1. DDD — the Auction and Watchlist aggregates

The `Auction` class is the core **aggregate root**. It owns its state (title, starting price, current highest bid, status) and enforces all business rules. Supporting it is the `Money` value object — an immutable type with a currency and a comparison method (`isGreaterThan`) that prevents nonsense like comparing USD to EUR.

The `Watchlist` aggregate (one per bidder, stream keyed by `bidderId`) owns a set of favorited auction IDs and enforces its own invariants (you can't favorite the same auction twice, or unfavorite one you never favorited).

Both aggregates expose domain operations (`create`, `start`, `placeBid`, `cancel`, `close` / `favorite`, `unfavorite`) rather than setters — the **anemic domain model anti-pattern** is explicitly avoided.

### 2. Event Sourcing — events as the source of truth

Aggregates do **not** write their state to the database. Instead, every operation produces a **domain event** — Auction: `AuctionCreated`, `AuctionStarted`, `BidPlaced`, `AuctionCancelled`, `AuctionClosed`; Watchlist: `AuctionFavorited`, `AuctionUnfavorited` — recorded internally on the aggregate (`uncommittedEvents`). Each aggregate has an `apply(event)` method that mutates its state, and a static `reconstitute(...)` method that rebuilds it from its full event history, remembering the version it was loaded at (`persistedVersion`).

A single generalized `EventStore` (`src/shared/infrastructure/EventStore.ts`) persists these events into an append-only `event_store` table keyed by `(streamId, version)`, tagged with a `streamType` (`"auction"` or `"watchlist"`). The unique constraint on `(streamId, version)` gives **optimistic concurrency control**: two writers trying to append the same version simultaneously — a `P2002` — surface as `OptimisticConcurrencyError`.

On top of that, mutating commands are wrapped with a **retry** behavior: on a concurrency conflict the whole command is replayed against fresh state (see CQRS below).

### 3. CQRS — commands vs. queries

The **write side** is implemented as command handlers — Auction: `CreateAuctionHandler`, `StartAuctionHandler`, `PlaceBidHandler`, `CancelAuctionHandler`; Watchlist: `FavoriteAuctionHandler`, `UnfavoriteAuctionHandler`. Each one:

1. Loads the aggregate via the repository (which reads the event stream and reconstitutes it).
2. Invokes a domain method on the aggregate.
3. Saves the new uncommitted events back through the repository.

Cross-cutting technical concerns are kept **out** of the handlers. Retry-on-conflict is applied declaratively at wiring time via a **decorator**, `withBehaviors(handler, { retry: true })` in `src/index.ts`, so handlers stay pure. All commands that mutate an existing aggregate run under `{ retry: true }`; `CreateAuction` opens a fresh stream (version 0) so it needs none. (A `withTransaction` behavior is a planned extension of the same seam — it awaits a Unit of Work, since repositories are currently singletons.)

The **read side** is implemented as query handlers (`GetActiveAuctionsHandler`, `GetMyFavoritesHandler`) that read from a **denormalized view**, never from the event store.

### 4. Read Models / Projections

After events are appended, the event store dispatches them to **projections** registered per `streamType`:

- `ActiveAuctionsProjection` keeps the `active_auctions_view` table in sync with auction events.
- `FavoritesProjection` maintains a bidder's `favorites_view`. Notably it consumes events from **both** contexts: `AuctionFavorited` / `AuctionUnfavorited` from Watchlist add/remove rows, while `AuctionStarted` / `BidPlaced` / `AuctionClosed` / `AuctionCancelled` from Auction update the denormalized status and current bid across everyone who favorited that auction.

Query endpoints read directly from these denormalized views, with no event replay involved.

---

## End-to-end flow (placing a bid)

Following a single request through the system shows how the layers cooperate:

1. **HTTP** — `POST /auctions/:id/bids` arrives at `auctionRouter.ts`. Zod validates the payload.
2. **Behavior** — the wired `placeBidHandler` is a `withBehaviors(..., { retry: true })` wrapper; it runs the handler and, on an `OptimisticConcurrencyError`, replays the whole thing.
3. **Application** — `PlaceBidHandler.execute()` loads the aggregate.
4. **Repository** — `AuctionRepository.getById()` reads all stored events for that stream and calls `Auction.reconstitute()` (which records `persistedVersion`).
5. **Domain** — `auction.placeBid(bidderId, money)` checks the rules (auction active, not self-bid, amount strictly higher than current highest) and records a `BidPlaced` event on itself.
6. **Repository → Event Store** — `AuctionRepository.save()` calls `EventStore.append()` with `expectedVersion` = the loaded version. If another writer already used the next version, the unique constraint fires → `OptimisticConcurrencyError` → the retry behavior reloads and re-validates against the now-higher bid (a losing bid then correctly fails with `BidTooLowError`).
7. **Projection** — the event store passes the new `BidPlaced` event to the projections registered for `"auction"` (`ActiveAuctionsProjection`, `FavoritesProjection`), which update their views.
8. **HTTP** — the handler returns; the response is sent.

A later `GET /auctions` does **not** touch the event store at all — it reads straight from the denormalized projection table.

---

## Current state of the code

What is actually implemented today:

- **Auction aggregate** with `create`, `start`, `placeBid`, `cancel`, `close`, `apply`, `reconstitute` — fully event-sourced, with a `SCHEDULED → ACTIVE → CLOSED/CANCELLED` lifecycle.
- **Watchlist aggregate** with `favorite` / `unfavorite`, one stream per bidder.
- **Money value object** with currency-safe comparison.
- **Domain events** for both contexts.
- **Typed domain errors** for every rule violation, mapped to HTTP status codes in `errorHandler.ts`.
- **Generalized `EventStore`** (in `shared/`) with append + read by stream + optimistic concurrency via unique constraint, plus per-`streamType` projection dispatch.
- **Optimistic concurrency + retry** — conflicts are detected via the `(streamId, version)` constraint and transparently retried via the `withBehaviors` decorator.
- **Repositories** (`AuctionRepository`, `WatchlistRepository`) that load/save aggregates through the event store.
- **Command handlers** for create / start / place-bid / cancel (Auction) and favorite / unfavorite (Watchlist).
- **Query handlers** `GetActiveAuctions` and `GetMyFavorites`, reading from projection tables.
- **Projections** `ActiveAuctionsProjection` and the cross-context `FavoritesProjection`.
- **Express routes** for auctions (`POST /auctions`, `GET /auctions`, `POST /auctions/:id/bids`, `POST /auctions/:id/cancellation`, `POST /auctions/:id/start`) and watchlist (`POST /watchlist/favorites`, `DELETE /watchlist/favorites/:auctionId`, `GET /watchlist/favorites`), all with Zod validation.
- **Unit tests** for `Auction`, `Money`, `Watchlist`, and the retry helper (pure, no database), plus a favorites integration test (requires a database).

What is not yet built:

- The **Identity** context — `X-User-Id` is a placeholder for a real identity/JWT layer.
- The **Notification** context and an in-process **Event Bus** for cross-context communication (today projections are dispatched synchronously inside `EventStore.append`).
- The remaining projections (`auction_detail`, `user_bids`, `user_won_auctions`).
- Automatic auction **closing** when the end time passes (needs a scheduler); `close()` exists on the aggregate but nothing triggers it yet.
- A **`withTransaction`** behavior (the decorator seam exists; it needs a Unit of Work) and keyset pagination for `GetMyFavorites`.

---

## Tech stack

| Layer | Technology |
|---|---|
| Runtime | Node.js + TypeScript (strict mode) |
| HTTP | Express 5 |
| Database | PostgreSQL |
| ORM | Prisma 7 (with `@prisma/adapter-pg`) |
| Validation | Zod 4 |
| Testing | Jest + ts-jest |
| ID generation | `uuid` |
| Tooling | Biome (lint + format), tsx (dev runner) |

---

## How to read this codebase

If you are new and want to understand the architecture quickly, read the files in this order:

1. `src/auction/domain/Money.ts` — the simplest building block: a value object.
2. `src/auction/domain/AuctionEvents.ts` — what events look like.
3. `src/auction/domain/Auction.ts` — the aggregate, the heart of the domain.
4. `src/auction/domain/__tests__/Auction.test.ts` — the rules expressed as executable specs.
5. `src/shared/infrastructure/EventStore.ts` — how events become rows and reach projections.
6. `src/auction/infrastructure/AuctionRepository.ts` — the bridge from events to aggregate.
7. `src/auction/application/commands/PlaceBid.ts` — a use case end-to-end.
8. `src/shared/application/withBehaviors.ts` + `retryOnConcurrencyConflict.ts` — cross-cutting retry as a decorator.
9. `src/auction/infrastructure/projections/ActiveAuctionsProjection.ts` — how a read model is built.
10. `src/watchlist/` — a second bounded context, and the cross-context `FavoritesProjection`.
11. `src/auction/api/auctionRouter.ts` — the thin HTTP edge.
12. `src/index.ts` — composition root: how all the pieces are wired together.

`PLAN.md` describes the full roadmap; `CLAUDE.md` documents the conventions and anti-patterns the project deliberately avoids; `JOURNAL.md` is the running log of day-by-day changes.