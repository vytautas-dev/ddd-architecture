---
status: accepted
---

# Read models are fed through Pulsar via a Hermes outbox, and projections enforce stream order themselves

The polling `CatchUpSubscription` is replaced by an event-driven pipeline: the command transaction writes events to `event_store` **and** queues them into the Hermes outbox; Hermes streams the outbox through PostgreSQL logical replication and publishes to Apache Pulsar; a separate worker consumes Pulsar and updates the read models. `event_store` stays the source of truth: Pulsar is transport only, because it cannot enforce `expectedVersion` and would cost us optimistic concurrency. We chose logical replication over a polling relay because WAL is ordered by commit, which removes the `BIGSERIAL` gap trap structurally instead of patching it with `pg_snapshot_xmin`.

## Considered Options

- **Publish from the handler after commit**: rejected, since a crash between commit and `send` loses the event forever (dual write).
- **Keep `CatchUpSubscription` as an outbox relay**: correct, but keeps both the polling and the gap trap.
- **Own logical replication directly on `event_store`** (event store as outbox, no duplication): rejected because hand-rolled LSN acknowledgement and resume-after-crash are where subtle bugs hide.
- **Rely on Pulsar for per-aggregate order**: rejected. A negative acknowledgement on `Key_Shared` can redeliver a message after newer ones. A per-row "last version" guard was also rejected: it silently drops an older event that changes *different* columns (an `AuctionStarted` arriving after a `BidPlaced` would be ignored, so the status stays wrong).

## Consequences

- **Projections enforce order, not the broker.** Each projection keeps a per-stream record of the last applied `version`, written in the same transaction as the view. The next version is applied, a duplicate is ignored, and a gap is nacked until the missing event arrives. `IProjection` therefore receives `streamId` and `version`. Events a projection does not handle still advance its record. A poison event goes to the dead-letter topic and takes every later event of that stream with it, which freezes that one aggregate loudly instead of corrupting it quietly. `dlq:replay` recovers it.
- **The command side moves to Postgres.js.** Hermes accepts only a Postgres.js transaction and Prisma has no Postgres.js adapter, so `PostgresUnitOfWork` and `EventStore` use Postgres.js behind the unchanged `IUnitOfWork`/`IEventStore` ports. Prisma remains for read models, queries and migrations.
- **The API process is also the relay and runs as a single instance.** `hermes.queue()` only works after `start()`, and `start()` takes the replication slot exclusively. Workers scale horizontally. Each projection has its own `Key_Shared` subscription keyed by `streamId`, so one failing view does not stall the others. The way out, if the API ever needs to scale, is one Hermes `partitionKey` (and slot) per API instance. The order guard above already tolerates the resulting cross-instance reordering.
- **Subscriptions are created by the API before it publishes anything**, together with each dead-letter topic's initial subscription. Pulsar keeps no messages on a topic without a subscription, so an event published before the worker's first run (or before a new projection exists) would be lost. The ledger would wait for it forever, and no replay could bring it back.
- **The `favorites_view → watchlist_auction_catalog_view` foreign key is dropped**, because independent subscriptions on separate topics have no cross-topic ordering.
- Postgres needs `wal_level=logical`. Existing data was wiped at the switch instead of seeding the per-stream records.
