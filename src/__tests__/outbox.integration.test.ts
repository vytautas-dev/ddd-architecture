import { randomUUID as uuid } from "node:crypto";
import { CreateAuctionHandler } from "../auction/application/commands/CreateAuction";
import { AuctionRepository } from "../auction/infrastructure/AuctionRepository";
import { withBehaviors } from "../shared/application/withBehaviors";
import { EventStore } from "../shared/infrastructure/EventStore";
import { OutboxEventStore } from "../shared/infrastructure/messaging/OutboxEventStore";
import { HERMES_SCHEMA } from "../shared/infrastructure/messaging/outboxRelay";
import { TOPICS } from "../shared/infrastructure/messaging/topology";
import { PostgresUnitOfWork } from "../shared/infrastructure/PostgresUnitOfWork";
import { createPostgresClient } from "../shared/infrastructure/postgresClient";
import {
  pausePulsar,
  readTopic,
  startRelay,
  subscriptionsOf,
  unpausePulsar,
} from "./support/pipeline";

// Seam: command → Pulsar topic. Read models are not involved yet — they still
// run through CatchUpSubscription.

const DAY = 24 * 60 * 60 * 1000;

const sql = createPostgresClient(process.env["DATABASE_URL"], {
  extraSchemas: [HERMES_SCHEMA],
});
const uow = new PostgresUnitOfWork(sql);
let relay: Awaited<ReturnType<typeof startRelay>>;
let eventStore: OutboxEventStore;

beforeAll(async () => {
  relay = await startRelay();
  eventStore = new OutboxEventStore(new EventStore(uow), uow, relay.outbox);
});

afterAll(async () => {
  await relay.stop();
  await sql.end();
});

describe("outbox → Pulsar (integration)", () => {
  it("publishes a command's event to its aggregate's topic, keyed by streamId, as an envelope", async () => {
    const createAuction = withBehaviors(
      new CreateAuctionHandler(new AuctionRepository(eventStore)),
      { transaction: uow },
    );
    const auctionId = uuid();
    const topic = await readTopic(relay.pulsar, TOPICS.auction);

    await createAuction.execute({
      auctionId,
      sellerId: uuid(),
      title: "Rower",
      startingPrice: { amount: 100, currency: "PLN" },
      startsAt: new Date(Date.now() + DAY),
      endsAt: new Date(Date.now() + 7 * DAY),
    });

    const received = await topic.waitFor(
      (r) => r.envelope.streamId === auctionId,
    );
    await topic.close();

    expect(received.key).toBe(auctionId);
    expect(received.envelope).toMatchObject({
      streamType: "auction",
      streamId: auctionId,
      version: 1,
      eventType: "AuctionCreated",
      payload: { eventType: "AuctionCreated", auctionId, title: "Rower" },
    });
  });

  it("routes each event to the topic of its stream type", async () => {
    const bidderId = uuid();
    const topic = await readTopic(relay.pulsar, TOPICS.watchlist);

    await uow.run(() =>
      eventStore.append("watchlist", bidderId, [testEvent("Noted")], 0),
    );

    const received = await topic.waitFor(
      (r) => r.envelope.streamId === bidderId,
    );
    await topic.close();
    expect(received).toMatchObject({
      key: bidderId,
      envelope: { streamType: "watchlist", version: 1, eventType: "Noted" },
    });
  });

  it("has every projection subscription in place before the first message", async () => {
    // startRelay provisions before hermes.start(), exactly like the API does
    expect(await subscriptionsOf(TOPICS.auction)).toEqual(
      expect.arrayContaining(["active-auctions", "watchlist-auction-catalog"]),
    );
    expect(await subscriptionsOf(TOPICS.watchlist)).toEqual(
      expect.arrayContaining(["watchlist-favorites"]),
    );
  });
});

describe("outbox → Pulsar: the guarantees", () => {
  it("publishes nothing for a transaction that rolls back (scenario 8)", async () => {
    const rolledBack = uuid();
    const committedAfter = uuid();
    const topic = await readTopic(relay.pulsar, TOPICS.watchlist);

    await expect(
      uow.run(async () => {
        await eventStore.append(
          "watchlist",
          rolledBack,
          [testEvent("Doomed")],
          0,
        );
        throw new Error("command failed after append");
      }),
    ).rejects.toThrow("command failed after append");
    await uow.run(() =>
      eventStore.append("watchlist", committedAfter, [testEvent("Kept")], 0),
    );

    // the relay publishes in commit order, so once the later event is here,
    // anything from the rolled-back transaction would already have arrived
    await topic.waitFor((r) => r.envelope.streamId === committedAfter);
    await topic.close();
    expect(topic.seen.map((r) => r.envelope.streamId)).not.toContain(
      rolledBack,
    );
  });

  it("still publishes an event whose transaction began first but committed last (gap trap, scenario 2)", async () => {
    const slow = uuid();
    const fast = uuid();
    const topic = await readTopic(relay.pulsar, TOPICS.watchlist);
    let releaseSlow!: () => void;
    const slowMayCommit = new Promise<void>((resolve) => {
      releaseSlow = resolve;
    });

    // the slow transaction inserts first (lower outbox position) and holds
    // its commit until the fast one has committed and been published
    const slowCommitted = uow.run(async () => {
      await eventStore.append("watchlist", slow, [testEvent("Slow")], 0);
      await slowMayCommit;
    });
    await uow.run(() =>
      eventStore.append("watchlist", fast, [testEvent("Fast")], 0),
    );
    await topic.waitFor((r) => r.envelope.streamId === fast);

    releaseSlow();
    await slowCommitted;

    // a position-based poller would already be past it; the WAL is not
    await topic.waitFor((r) => r.envelope.streamId === slow);
    await topic.close();
    const order = topic.seen
      .map((r) => r.envelope.streamId)
      .filter((id) => id === slow || id === fast);
    expect(order).toEqual([fast, slow]); // commit order, not insert order
  });

  it("accepts commands while Pulsar is down and publishes them once it is back (scenario 6)", async () => {
    const duringOutage = uuid();
    const topic = await readTopic(relay.pulsar, TOPICS.watchlist);

    pausePulsar();
    try {
      // the command only needs Postgres — the outbox row commits with it
      await uow.run(() =>
        eventStore.append("watchlist", duringOutage, [testEvent("Queued")], 0),
      );
      await sleep(2_000); // let the relay try, time out and back off
    } finally {
      unpausePulsar();
    }

    const received = await topic.waitFor(
      (r) => r.envelope.streamId === duringOutage,
      60_000,
    );
    await topic.close();
    expect(received.envelope.eventType).toBe("Queued");
  }, 90_000);
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function testEvent(eventType: string) {
  return { eventType, occurredAt: new Date() };
}
