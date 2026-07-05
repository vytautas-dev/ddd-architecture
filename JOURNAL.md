# Change Journal — BidFlow

A record of what we changed each day: **what**, **why**, and **which pattern** it relates to.
Newest entry on top. Date format: `YYYY-MM-DD`.

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