# Change Journal — BidFlow

A record of what we changed each day: **what**, **why**, and **which pattern** it relates to.
Newest entry on top. Date format: `YYYY-MM-DD`.

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