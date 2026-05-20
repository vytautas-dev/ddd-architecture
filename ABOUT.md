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

- A **seller** can list an item for auction by providing a **title**, a **starting price**, and an **end date**.
- Other users (**bidders**) can place bids on active auctions.
- A bid is only valid if it is **strictly higher** than the current highest bid (or higher than the starting price if no bids have been placed yet).
- A **seller cannot bid on their own auction**.
- The seller can **cancel** an auction, but **only as long as no bids have been placed**.
- When the end time passes, the auction is **closed**. The highest bidder wins; if there are no bids, the auction closes with no winner.

These rules are enforced inside the `Auction` aggregate (`src/auction/domain/Auction.ts`) and surface to the outside world as typed domain errors (`BidTooLowError`, `SellerCannotBidError`, `CannotCancelAuctionWithBidsError`, `AuctionClosedError`, `AuctionNotFoundError`).

---

## Why this domain?

Auctions are well-suited to teach the target patterns because:

- They have **clear invariants** — perfect for an aggregate (`Auction`) that protects its own consistency.
- They have an obvious **append-only history** — every bid, cancellation, and closure is naturally an event, which is exactly what Event Sourcing models.
- Their **read needs differ from their write needs** — placing a bid requires consistency on a single auction; listing active auctions requires a denormalized, query-friendly view. That gap is what CQRS and projections exist to solve.

---

## Bounded contexts

The project is organized as several **bounded contexts**, each living in its own folder under `src/`:

| Context | Role | Status |
|---|---|---|
| **Auction** | Core domain — listings, bidding, cancellation, closing | Actively being built |
| **Identity** | Generic subdomain — users, registration, login | Planned, intentionally minimal |
| **Notification** | Generic subdomain — notifies users about outbids and wins | Planned |

Only the **Auction** context is being implemented in depth; the others exist to teach context boundaries and inter-context communication later in the roadmap.

---

## Architecture in layers

Inside each bounded context the code is split into four layers, with dependencies pointing **inward** (the outer layers know the inner layers, never the other way around):

```
src/auction/
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

### 1. DDD — the Auction aggregate

The `Auction` class is the **aggregate root**. It owns its state (title, starting price, current highest bid, status) and enforces all business rules. Supporting it is the `Money` value object — an immutable type with a currency and a comparison method (`isGreaterThan`) that prevents nonsense like comparing USD to EUR.

The aggregate exposes domain operations (`create`, `placeBid`, `cancel`, `close`) rather than setters — the **anemic domain model anti-pattern** is explicitly avoided.

### 2. Event Sourcing — events as the source of truth

The aggregate does **not** write its state to the database. Instead, every operation produces a **domain event** (`AuctionCreated`, `BidPlaced`, `AuctionCancelled`, `AuctionClosed`) which is recorded internally on the aggregate (`uncommittedEvents`). The aggregate also has an `apply(event)` method that mutates its state in response to an event, and a static `reconstitute(events[])` method that rebuilds an aggregate from its full event history.

The `PrismaEventStore` persists these events into a single append-only `event_store` table keyed by `(streamId, version)`. The unique constraint on that pair gives us **optimistic concurrency control** — two writers trying to append the same version simultaneously will get a `OptimisticConcurrencyError`.

### 3. CQRS — commands vs. queries

The **write side** is implemented as command handlers (`CreateAuctionHandler`, `PlaceBidHandler`, `CancelAuctionHandler`). Each one:

1. Loads the aggregate via the repository (which reads the event stream and reconstitutes the `Auction`).
2. Invokes a domain method on the aggregate.
3. Saves the new uncommitted events back through the repository.

The **read side** is implemented as query handlers (`GetActiveAuctionsHandler`) that read from a **denormalized view**, not from the event store.

### 4. Read Models / Projections

After events are appended, the event store dispatches them to **projections** that maintain query-optimized tables. `ActiveAuctionsProjection` listens to auction events and keeps the `active_auctions_view` table in sync — inserting on `AuctionCreated`, updating on `BidPlaced`, deleting on `AuctionClosed` / `AuctionCancelled`. The HTTP endpoint `GET /auctions` reads directly from this denormalized view, with no event replay involved.

---

## End-to-end flow (placing a bid)

Following a single request through the system shows how the layers cooperate:

1. **HTTP** — `POST /auctions/:id/bids` arrives at `auctionRouter.ts`. Zod validates the payload.
2. **Application** — `PlaceBidHandler.execute()` loads the aggregate.
3. **Repository** — `AuctionRepository.getById()` reads all stored events for that stream and calls `Auction.reconstitute()`.
4. **Domain** — `auction.placeBid(bidderId, money)` checks the rules (auction active, not self-bid, amount strictly higher than current highest) and records a `BidPlaced` event on itself.
5. **Repository → Event Store** — `AuctionRepository.save()` calls `PrismaEventStore.append()`, which writes the new event with `version = previousVersion + 1`. If another writer already used that version, the unique constraint fires and an `OptimisticConcurrencyError` is raised.
6. **Projection** — the event store passes the new `BidPlaced` event to `ActiveAuctionsProjection`, which updates `active_auctions_view`.
7. **HTTP** — the handler returns; the response is sent.

A later `GET /auctions` does **not** touch the event store at all — it reads straight from the denormalized projection table.

---

## Current state of the code

What is actually implemented today:

- **Auction aggregate** with `create`, `placeBid`, `cancel`, `close`, `apply`, `reconstitute` — fully event-sourced.
- **Money value object** with currency-safe comparison.
- **Domain events** for the four lifecycle moments.
- **Typed domain errors** for every rule violation.
- **PrismaEventStore** with append + read by stream + optimistic concurrency via unique constraint.
- **AuctionRepository** that loads/saves the aggregate through the event store.
- **Command handlers** for `CreateAuction`, `PlaceBid`, `CancelAuction`.
- **Query handler** `GetActiveAuctions` reading from the projection table.
- **ActiveAuctionsProjection** maintaining the `active_auctions_view`.
- **Express routes** `POST /auctions` and `GET /auctions`, with Zod validation.
- **Unit tests** for `Auction` and `Money` (pure, no database).

What is not yet built:

- The Identity and Notification bounded contexts.
- The remaining projections (`auction_detail`, `user_bids`, `user_won_auctions`).
- Routes for placing bids and cancelling auctions (handlers exist; HTTP plumbing is pending).
- An in-process Event Bus for cross-context communication.
- Automatic auction closing when the end time passes.

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
5. `src/auction/infrastructure/PrismaEventStore.ts` — how events become rows.
6. `src/auction/infrastructure/AuctionRepository.ts` — the bridge from events to aggregate.
7. `src/auction/application/commands/PlaceBid.ts` — a use case end-to-end.
8. `src/auction/infrastructure/projections/ActiveAuctionsProjection.ts` — how a read model is built.
9. `src/auction/api/auctionRouter.ts` — the thin HTTP edge.
10. `src/index.ts` — composition root: how all the pieces are wired together.

`PLAN.md` describes the full roadmap; `CLAUDE.md` documents the conventions and anti-patterns the project deliberately avoids.