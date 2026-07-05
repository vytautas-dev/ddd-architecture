# Change Journal — BidFlow

A record of what we changed each day: **what**, **why**, and **which pattern** it relates to.
Newest entry on top. Date format: `YYYY-MM-DD`.

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