# Change Journal — BidFlow

A record of what we changed each day: **what**, **why**, and **which pattern** it relates to.
Newest entry on top. Date format: `YYYY-MM-DD`.

---

## 2026-07-05 — Learning note: transaction boundaries — endpoints, projections, queries

**Topic:** three follow-up questions after wiring the Unit of Work: (1) what if one endpoint calls several handlers (each opens its own transaction)? (2) do projections need transactions? (3) do queries (GETs) need them?

### 1. Endpoint calling multiple handlers → design smell, not a missing feature
- CQRS invariant: **one request → one command → one handler → one aggregate → one transaction.** Vernon's rule: *aggregate boundary = consistency boundary = transaction boundary* — the domain model draws the line, not the endpoint.
- The urge to call two handlers from one endpoint signals either: (a) it's really **one business intention** → model it as one command (maybe the aggregate boundaries are wrong), or (b) it's a **process spanning aggregates** → eventual consistency via events (we already do this: `FavoritesProjection` reacts to Auction events — no cross-context transaction).
- Technically today: each `withBehaviors({ transaction: uow })` handler opens its own tx. Wrapping two handlers in an outer `uow.run()` would NOT work:
  - our `run()` is **not reentrant** — a nested `$transaction` opens an *independent* tx on another connection (Spring vocabulary: we have `REQUIRES_NEW` semantics, composing would need `REQUIRED` = "join if present") + deadlock risk (outer tx holds locks the inner one waits for);
  - **retry breaks**: a `P2002` inside an outer tx aborts the WHOLE Postgres transaction (no further statements allowed) — retry inside it would write into a dead tx. Retry boundary must equal transaction boundary must equal consistency boundary.
- The real-world answer for multi-aggregate processes: **Saga / Process Manager** — a sequence of local transactions linked by events, with **compensating actions** instead of rollback (cancel the flight, don't pretend it never happened). Future stage, needs async event handling first.

### 2. Do projections need transactions? Depends WHOSE transaction
- **Ours today (synchronous projections): yes, the command's tx** — we have no replay mechanism, so a lost view update would be permanent. The price (named!): **a buggy projection fails the command** — read side can take down write side. Acceptable here; the main reason production systems go async.
- **Target ES architecture (async projections): not the command's tx** — but they still need their own consistency story, one of:
  | Strategy | How | Cost |
  |---|---|---|
  | own small tx | update view + save **checkpoint** atomically | local transaction per batch |
  | idempotency | re-applying the same event is harmless → at-least-once delivery suffices | must audit every handler |
- Idempotency audit of our own code: `AuctionStarted → update {status}` idempotent ✅; `AuctionFavorited → upsert` idempotent ✅; `BidPlaced → totalBids: {increment: 1}` **NOT idempotent** ❌ (double-apply counts twice) — first thing to fix when we go async; `AuctionCreated → create` throws on duplicate (handle-able).

### 3. Do queries need transactions? No — and it's CQRS working as designed
- Queries write nothing (nothing to roll back) and never hit version conflicts (retry pointless) → that's why GET handlers are not wrapped in `withBehaviors` at all.
- A single `SELECT` already runs on a consistent snapshot (implicit per-statement transaction in Postgres). Our queries are one `findMany` on one denormalized table — **by design**: projections do the hard joining work at write time so reads are flat.
- If a query ever needed several tables read consistently → smell: reshape the read model (new projection), don't add transactions. Legitimate read-tx cases: multi-SELECT snapshot exports (`REPEATABLE READ`), or read-before-write — but that's a command (`FavoriteAuctionHandler` reads via `uow.client` for exactly this reason).
- Wiring as documentation: query handlers deliberately receive raw `prisma` (not `uow`) — the signature says *"never participates in transactions."*

### Key intuition
> A transaction is not a glue for operations — it's the **expression of a consistency boundary**, and that boundary is drawn by the domain model (the aggregate), not by the endpoint.
> Projections don't need *the command's* transaction — they need **replayability** (checkpoint+tx, or idempotency); borrowing the command's tx is just our simplest way to get it today.
> Commands coordinate many writes → tx. Queries in CQRS make one read from one table → the DB's snapshot already covers them.

---

## 2026-07-05 — Transactions (atomicity): Unit of Work via AsyncLocalStorage + `transaction` behavior

**Topic:** atomic commit of events + projections — the deferred `withTransaction` behavior, unblocked by the Unit of Work pattern.

### The problem
`EventStore.append` did `createMany(events)` and then ran projections as **separate DB ops on separate connections**. Crash (or projection bug) after the event insert → event store says "bid 150", views say "bid 100", **forever** (no replay mechanism exists). Also: multiple events per command updated views partially, and two projections for one event could diverge from each other.

What was already atomic: `createMany` itself (single statement), and every handler saves **one aggregate** (no cross-aggregate atomicity needed — by design).

### The blocker and the pattern
Repos/EventStore/projections are **singletons** with a baked-in `PrismaClient`; a Prisma interactive transaction hands you a `tx` client that somehow must reach all of them for one command only — without polluting `IEventStore`/`IProjection` signatures (domain purity). Solution: **Unit of Work** carried by **`AsyncLocalStorage`** (Node's thread-local for async chains: context is attached to *causality* — whatever an execution schedules inherits its context — so concurrent requests never see each other's value despite one thread).

### What we did
- **`PrismaUnitOfWork`** (`shared/infrastructure/`): `run(fn)` = `prisma.$transaction(tx => als.run(tx, fn))`; `client` getter = `getStore() ?? prisma` (tx inside `run()`, singleton fallback outside → non-transactional code untouched). Typed as `Prisma.TransactionClient` so nobody can call `$transaction` through it (API that makes the mistake impossible > comment).
- **`IUnitOfWork` port** in `shared/application/` — `withBehaviors` never imports Prisma (Dependency Inversion).
- **`EventStore` + both projections + `FavoriteAuctionHandler`** switched to `uow.client` — zero interface changes. (Also fixed FavoritesProjection's wrong `@prisma/client/extension` import.)
- **`withBehaviors` gained `transaction: IUnitOfWork`** — order enforced & tested: **retry wraps transaction** (a conflict aborts the whole PG tx, so each attempt needs a fresh one).
- **Wiring:** all mutating commands run `{ retry: true, transaction: uow }`; `CreateAuction` gets `{ transaction: uow }` only (fresh stream — nothing to conflict with, but still needs atomicity).
- **Proof:** `atomicity.integration.test.ts` with a saboteur projection registered *before* `ActiveAuctionsProjection` — 3 tests: success commits event+view together; with tx a projection failure rolls back the event; **without tx the same failure leaves event persisted + view stale** (the test documents the bug we fixed).

### Pitfall found: parallel Jest workers vs shared DB
First run looked like rollback was broken — it wasn't. Jest runs test **files** in parallel workers; both integration files `TRUNCATE` the same tables, so one wiped the other mid-flight (clue: a test doing exactly what the failing fragment did was passing). Fix: `maxWorkers: 1` in `jest.config.ts` + atomicity assertions scoped to the specific `streamId` instead of global `count()`. Lesson: integration tests sharing a DB must be serialized or data-isolated.

### New / changed files
- `+ src/shared/infrastructure/PrismaUnitOfWork.ts` (+ 4 unit tests, fake `$transaction`, ALS context survival across event-loop hops + concurrent-run isolation)
- `+ src/shared/application/IUnitOfWork.ts`
- `+ src/shared/application/__tests__/withBehaviors.test.ts` (fresh tx per retry attempt)
- `+ src/shared/infrastructure/__tests__/atomicity.integration.test.ts`
- `~ EventStore, ActiveAuctionsProjection, FavoritesProjection, FavoriteAuction` (→ `uow.client`)
- `~ withBehaviors` (`transaction` behavior), `~ index.ts` (wiring), `~ favorites.integration.test.ts` (mirrors prod wiring incl. behaviors), `~ jest.config.ts` (`maxWorkers: 1`)

### Deliberately deferred
- **Async projections** (catch-up subscription + checkpoints) — would replace transactional projections with eventual consistency; next big stage.
- Interactive-transaction timeout is Prisma's default (~5 s) — fine for two projections, revisit if projections grow.

### Documentation
- Updated: `CLAUDE.md` (Current Stage → transactions DONE; parked list now leads with async projections).

### Status
Typecheck clean. Tests: **59 green** (incl. integration). Lint: no new errors (17 pre-existing).

---

## 2026-07-05 — Learning note: transaction isolation & MVCC vs our version counter

**Topic:** what DB transaction isolation actually is, how PostgreSQL's MVCC relates to our optimistic concurrency, and why we don't need it as a guard. (Prompted by mentor: read PostgreSQL docs ch. 13.2.)

### Two separate axes — don't conflate them
- **Transaction isolation** = *how much* protection I want against concurrency anomalies (the goal / guarantee level). Defined by which anomalies are forbidden: dirty read, nonrepeatable read, phantom read, serialization anomaly.
- **Locking (pessimistic / optimistic)** = *how* the DB achieves it (the mechanism). Isolation ≠ pessimistic locking — pessimistic locking is just **one technique** to reach an isolation level.

### The four levels (PostgreSQL implements 3)
| Level | Guarantee | How PG does it |
|---|---|---|
| Read Committed (**PG + Prisma default**) | fresh snapshot **per statement** | MVCC |
| Repeatable Read | one snapshot **per transaction** (Snapshot Isolation) | MVCC + `40001` on conflict |
| Serializable | as if run one-at-a-time | MVCC + read/write-dependency checks |

Higher isolation = fewer locks but more "losers" that must **retry** (`40001 could not serialize`). Same philosophy as our optimistic concurrency.

### "Optimistic" — philosophy vs named pattern (the confusion I had to untangle)
- **Optimistic as a philosophy**: don't block, detect conflict at write, loser retries. Held by BOTH our version counter AND Postgres MVCC.
- **"Optimistic locking" as a named pattern**: version column + retry, lives **in app code**. Postgres does **not** do this for us.
- Postgres reaches high isolation via **MVCC** (multiple row versions + snapshots), which is optimistic *in character* but is a **different mechanism** from our version counter. So: "optimistic locking" is NOT a Postgres isolation method — MVCC is.

### MVCC vs our version counter (Anna vs Bartek, price 100 → both bid)
| | Version counter (ours) | MVCC (Postgres) |
|---|---|---|
| Who holds the reference point? | **us** — event `version` | **DB** — the snapshot |
| What triggers the conflict? | inserting an existing version (`@@unique([streamId, version])`) | commit on a row changed after the snapshot |
| Error | `OptimisticConcurrencyError` (from `P2002`) | `40001 could not serialize` |
| Where the guard lives | our app | inside PostgreSQL |
| What we must set up | version design + `unique` | raise isolation level |

Both end identically: loser gets "conflict" → retries on fresh state.

### Would we "implement MVCC"? What would it take?
- **MVCC is not something you implement** — Postgres always has it, on by default.
- To use it *as the guard*, you'd need: (1) wrap read+write in **one transaction**, (2) set `isolationLevel: 'Serializable'`, (3) catch `40001` and retry (our `retryOnConcurrencyConflict` already exists — just teach it `40001` too).
- **Isolation level is a property of a transaction** — no transaction, nothing to isolate. So yes, MVCC-as-guard requires introducing transactions.

### Is MVCC the only mechanism? No — Postgres offers a whole spectrum
MVCC is the **backbone** (all three isolation levels stand on it), but the docs describe more, sitting alongside/on top of it:
| Mechanism | Character | Who turns it on |
|---|---|---|
| MVCC / snapshots | optimistic | always, automatic |
| Row **write lock** (2nd writer to same row **waits** for the 1st to commit/rollback) | pessimistic (implicit) | always, automatic |
| `SELECT ... FOR UPDATE` / `FOR SHARE`, table locks | pessimistic (explicit) | **us**, opt-in |
| Predicate locks (`SIReadLock`, Serializable only) | **detection**, does NOT block | DB, automatic |

Takeaways:
- MVCC is **not** 100% lock-free — writes to the **same row** are serialized by an implicit write lock (docs: *"the would-be updater will wait for the first updating transaction to commit or roll back"*).
- Postgres gives us **both worlds in one DB**: optimistic by default (MVCC), and one command (`FOR UPDATE`) flips a given operation to pessimistic blocking → the "hybrid per operation" from the previous journal entry.
- So we now have the full set of three approaches, all available at once: **optimistic (MVCC)**, **explicit pessimistic (`FOR UPDATE`)**, and our **app-level version counter**.

### Verdict for BidFlow
- We **don't** need MVCC as a guard. Event Sourcing is **append-only** — there's no row to `UPDATE`, so the natural concurrency guard is the **stream version** (`@@unique([streamId, version])`). That's the canonical ES pattern, and we already have it. MVCC/Serializable is the tool for the classic mutate-in-place model (`UPDATE accounts SET balance = ...`) where there's no version to check.
- The real reason to introduce transactions is **atomicity, not isolation**: today `EventStore.append` does `createMany(events)` and then updates projections as **two separate DB ops** — a crash between them leaves the read model stale. Wrapping both in one transaction gives "all-or-nothing." → this is exactly the deferred **`withTransaction`** behavior.

### Key intuition
> **Isolation** = "how much protection." **Locking** = "by what method." Not synonyms — a goal level vs a mechanism.
> Postgres reaches isolation via **MVCC** (optimistic in style, DB is the guard); our version counter is optimistic too but the guard lives in **our** code.
> Event Sourcing already ships its own guard (stream version), so for us transactions are about **atomicity** (events + projections together), not isolation.

---

## 2026-07-05 — Learning note: optimistic vs pessimistic locking

**Topic:** how the two concurrency-control strategies differ, and how to pick one per operation.

### Core difference
- **Optimistic** assumes conflicts are **rare**: act freely, detect the clash **at write time** (version mismatch) → error → retry or report. Never blocks. Zero happy-path cost, scales well under low contention. Fits stateless HTTP and Event Sourcing (stream version is built in).
- **Pessimistic** assumes conflicts are **likely**: **lock up front** at read time (`SELECT ... FOR UPDATE`), others wait their turn. No conflict happens because the second writer queued. Constant cost per op; risks deadlocks and lower throughput; needs the transaction held open.

| Dimension | Optimistic | Pessimistic |
|---|---|---|
| Assumption | conflicts rare | conflicts likely |
| Blocks? | never (detects at write) | yes (locks at read) |
| Mechanism | version / timestamp | DB row lock |
| On conflict | write rejected → retry | second writer just waited |
| Happy-path cost | zero | constant (everyone pays) |
| Main risk | wasted work / livelock | deadlock / queuing |
| Fits stateless + ES | naturally | awkwardly |

### Decision rule (three questions)
1. Are collisions **frequent** (everyone hits the same row)? → pessimistic (high contention kills retry).
2. Is **re-running** the operation expensive/dangerous (side effects)? → pessimistic.
3. Is the op **short** and the system **stateless** (HTTP)? → optimistic.

All three point to optimistic → optimistic. Any strong pessimistic signal (esp. money or a uniquely physical resource) → consider a lock.

### Real-world examples
- **Optimistic:** editing your profile/settings; wiki & shared docs (Confluence — can't hold a lock for 10 min of editing); shopping cart edits; Jira/Linear tickets; **BidFlow bidding**.
- **Pessimistic:** bank transfers / account balance (no risk of double-spend); reserving a specific seat (cinema/flight — one physical 14C); last item in a flash sale (high contention → optimistic would livelock); invoice-number sequence generator; batch jobs that must not run twice.

### Key intuition
> Money and physically-unique resources (this seat, this last unit) → usually **pessimistic**.
> "My own" or rarely-shared data (profile, doc, ticket, auction bid) → usually **optimistic**.
> Many real systems are **hybrid** — catalog & cart optimistic, final stock decrement pessimistic. Choose **per operation**, not per app.

Mnemonic: optimistic = "act and apologize if needed" (detect at write); pessimistic = "ask permission up front" (lock at read).

---

## 2026-07-05 — Concurrency control: retry + behaviors decorator

**Topic:** optimistic concurrency control and a retry mechanism as a cross-cutting concern.

### What we did
- **Finalized optimistic concurrency** — confirmed both aggregates (`Auction`, `Watchlist`) hold `persistedVersion` (the version at load time), and the event store enforces `@@unique([streamId, version])`; a `P2002` conflict becomes `OptimisticConcurrencyError`.
- **Moved `OptimisticConcurrencyError`** from `shared/infrastructure/EventStore.ts` to `shared/domain/OptimisticConcurrencyError.ts` — so the application layer can catch it without breaking the "dependencies point inward" rule.
- **Added `retryOnConcurrencyConflict`** (`shared/application/`) — retries the **whole cycle** load→decide→save (not just the save!), because after a conflict the in-memory aggregate is stale. It retries only on `OptimisticConcurrencyError`; any other error (including a legitimate domain rejection) propagates immediately. Unit test covers 4 cases.
- **Introduced the `withBehaviors(handler, { retry: true })` decorator** (`shared/application/`) + a shared `CommandHandler` interface — retry is applied **declaratively at wiring time in `index.ts`**, not hand-wrapped in each handler. Handlers returned to their clean form (removed inline retry from 5 handlers).
- **Covered all commands that mutate an existing aggregate with retry:** `PlaceBid`, `CancelAuction`, `StartAuction`, `FavoriteAuction`, `UnfavoriteAuction`. `CreateAuction` is **excluded** — it opens a fresh stream (version 0), so a conflict would mean a UUID collision, which we don't retry.

### Why
- Retry and (future) transactionality are **cross-cutting concerns** — not the logic of any single command. Pattern: **Decorator** (declared in one place, handlers stay pure).
- `placeBid` is the textbook case: after a retry the bid is **re-validated** against the fresh highest bid → the loser correctly gets `BidTooLowError`. Retry = re-running the domain rules, not blindly repeating a save.
- Future behavior composition: `retry( transaction( handler ) )` — retry outermost (fresh transaction after a rollback), transaction innermost.

### Deliberately deferred
- **`withTransaction`** — the seam exists in `withBehaviors`, but it needs a **Unit of Work** (per-request repositories bound to `tx`; today they're singletons with a baked-in `prisma`). Not building it ahead of need (premature abstraction).
- The decorator wraps the **entire** `execute` — in `FavoriteAuction`, a conflict will also re-run the idempotent ACL read (`activeAuctionView`). Acceptable cost (conflicts are rare, the read is cheap).

### New / changed files
- `+ src/shared/domain/OptimisticConcurrencyError.ts`
- `+ src/shared/application/CommandHandler.ts`
- `+ src/shared/application/withBehaviors.ts`
- `+ src/shared/application/retryOnConcurrencyConflict.ts` (+ test)
- `~ src/shared/infrastructure/EventStore.ts` (imports the error from domain)
- `~ src/auction/api/errorHandler.ts` (imports the error from domain)
- `~ handlers: PlaceBid, CancelAuction, StartAuction, FavoriteAuction, UnfavoriteAuction` (clean, `implements CommandHandler`)
- `~ src/index.ts` (wired via `withBehaviors({ retry: true })`)

### Documentation
- Updated: `CLAUDE.md` (Current Stage → concurrency DONE).
- To consider (flagged, untouched): `ABOUT.md` is stale (predates the Watchlist context); `DOMAIN_REVIEW.md` question #7 is effectively resolved.

### Status
Typecheck clean. Tests: 43 green (excluding integration tests, which require a database).