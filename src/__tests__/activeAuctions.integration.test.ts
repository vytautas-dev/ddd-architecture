import { randomUUID as uuid } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { CreateAuctionHandler } from "../auction/application/commands/CreateAuction";
import { PlaceBidHandler } from "../auction/application/commands/PlaceBid";
import { GetActiveAuctionsHandler } from "../auction/application/queries/GetActiveAuctions";
import { AuctionRepository } from "../auction/infrastructure/AuctionRepository";
import { ActiveAuctionsProjection } from "../auction/infrastructure/projections/ActiveAuctionsProjection";
import { PrismaClient } from "../generated/prisma/client";
import { withBehaviors } from "../shared/application/withBehaviors";
import type { DomainEvent } from "../shared/domain/DomainEvent";
import type { IProjection } from "../shared/domain/IProjection";
import { EventStore } from "../shared/infrastructure/EventStore";
import type { EventEnvelope } from "../shared/infrastructure/messaging/EventEnvelope";
import { OutboxEventStore } from "../shared/infrastructure/messaging/OutboxEventStore";
import { HERMES_SCHEMA } from "../shared/infrastructure/messaging/outboxRelay";
import {
  StreamOrderedProjection,
  StreamVersionConflictError,
} from "../shared/infrastructure/messaging/StreamOrderedProjection";
import { StreamVersionLedger } from "../shared/infrastructure/messaging/StreamVersionLedger";
import { TOPICS } from "../shared/infrastructure/messaging/topology";
import { PostgresUnitOfWork } from "../shared/infrastructure/PostgresUnitOfWork";
import { PrismaUnitOfWork } from "../shared/infrastructure/PrismaUnitOfWork";
import { createPostgresClient } from "../shared/infrastructure/postgresClient";
import { createWorker } from "../worker";
import { eventually, publishEnvelope, startRelay } from "./support/pipeline";

const DAY = 24 * 60 * 60 * 1000;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env["DATABASE_URL"] }),
});
const sql = createPostgresClient(process.env["DATABASE_URL"], {
  extraSchemas: [HERMES_SCHEMA],
});
const commandUow = new PostgresUnitOfWork(sql);
const activeAuctions = new GetActiveAuctionsHandler(prisma);
let relay: Awaited<ReturnType<typeof startRelay>>;
let worker: ReturnType<typeof createWorker> | undefined;

beforeAll(async () => {
  relay = await startRelay();
});

afterEach(async () => {
  await worker?.stop();
  worker = undefined;
});

afterAll(async () => {
  await relay.stop();
  await sql.end();
  await prisma.$disconnect();
});

async function startWorker(): Promise<void> {
  worker = createWorker({
    prisma,
    pulsar: relay.pulsar,
    nackRedeliveryMs: 200,
  });
  await worker.start();
}

function commands() {
  const repository = new AuctionRepository(
    new OutboxEventStore(new EventStore(commandUow), commandUow, relay.outbox),
  );
  return {
    createAuction: withBehaviors(new CreateAuctionHandler(repository), {
      transaction: commandUow,
    }),
    placeBid: withBehaviors(new PlaceBidHandler(repository), {
      retry: true,
      transaction: commandUow,
    }),
  };
}

async function createActiveAuction(title: string): Promise<string> {
  const auctionId = uuid();
  await commands().createAuction.execute({
    auctionId,
    sellerId: uuid(),
    title,
    startingPrice: { amount: 100, currency: "PLN" },
    startsAt: new Date(Date.now() - DAY), // already started → ACTIVE
    endsAt: new Date(Date.now() + 7 * DAY),
  });
  return auctionId;
}

// The query returns whole view rows (no `select`); its DTO type just doesn't
// list `status`, which scenario 9 needs to see.
const rowOf = async (auctionId: string) =>
  (await activeAuctions.execute()).find((row) => row.id === auctionId) as
    | (Awaited<ReturnType<typeof activeAuctions.execute>>[number] & {
        status: string;
      })
    | undefined;

describe("active auctions view — command → view (seam 1)", () => {
  it("applies events published before the worker's first run (scenario 11)", async () => {
    const auctionId = await createActiveAuction("Rower");
    await commands().placeBid.execute({
      auctionId,
      bidderId: uuid(),
      amount: { amount: 150, currency: "PLN" },
    });

    await startWorker();

    const row = await eventually(
      () => rowOf(auctionId),
      (r) => r?.totalBids === 1,
    );
    expect(row).toMatchObject({
      title: "Rower",
      currentBid: 150,
      totalBids: 1,
    });
  });

  it("shows a new bid once the worker has projected it (scenario 1)", async () => {
    await startWorker();
    const auctionId = await createActiveAuction("Laptop");

    await commands().placeBid.execute({
      auctionId,
      bidderId: uuid(),
      amount: { amount: 120, currency: "PLN" },
    });

    const row = await eventually(
      () => rowOf(auctionId),
      (r) => r?.currentBid === 120,
    );
    expect(row).toMatchObject({
      currentBid: 120,
      totalBids: 1,
      currency: "PLN",
    });
  });

  it("catches up after the worker was down (scenario 5)", async () => {
    await startWorker();
    await worker?.stop();
    worker = undefined;

    const auctionId = await createActiveAuction("Rower");
    await commands().placeBid.execute({
      auctionId,
      bidderId: uuid(),
      amount: { amount: 200, currency: "PLN" },
    });
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    expect(await rowOf(auctionId)).toBeUndefined(); // nobody consumed it yet

    await startWorker();
    const row = await eventually(
      () => rowOf(auctionId),
      (r) => r?.currentBid === 200,
    );
    expect(row?.totalBids).toBe(1);
  });
});

describe("active auctions view — topic message → view (seam 2)", () => {
  beforeEach(startWorker);

  it("ignores a duplicate delivery (scenario 7)", async () => {
    const auctionId = uuid();
    await publish(created(auctionId, 1, "ACTIVE"));
    await publish(bidPlaced(auctionId, 2, 120, 1));
    await eventually(
      () => rowOf(auctionId),
      (r) => r?.currentBid === 120,
    );

    // same version again, with a payload that would be visible if applied
    await publish(bidPlaced(auctionId, 2, 999, 1));
    await processedEverythingBefore();

    expect(await rowOf(auctionId)).toMatchObject({
      currentBid: 120,
      totalBids: 1,
    });
  });

  it("ends correct when a later version arrives first (scenario 9)", async () => {
    const auctionId = uuid();
    await publish(created(auctionId, 1, "SCHEDULED"));
    // v3 overtakes v2 — they touch different columns, so neither may be lost
    await publish(bidPlaced(auctionId, 3, 150, 1));
    await publish(started(auctionId, 2));

    const row = await eventually(
      () => rowOf(auctionId),
      (r) => r?.status === "ACTIVE" && r.currentBid === 150,
    );
    expect(row).toMatchObject({
      status: "ACTIVE",
      currentBid: 150,
      totalBids: 1,
    });
  });

  it("does not resurrect a deleted row with a late, older event", async () => {
    const auctionId = uuid();
    await publish(created(auctionId, 1, "ACTIVE"));
    await publish(closed(auctionId, 2));
    await processedEverythingBefore();
    expect(await rowOf(auctionId)).toBeUndefined();

    await publish(created(auctionId, 1, "ACTIVE")); // redelivered AuctionCreated
    await processedEverythingBefore();

    expect(await rowOf(auctionId)).toBeUndefined();
  });

  it("warns, without failing, when an event finds no row to update", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const auctionId = uuid();

    await publish(bidPlaced(auctionId, 1, 120, 1)); // no AuctionCreated before it
    await processedEverythingBefore();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining(auctionId));
    warn.mockRestore();
  });
});

describe("StreamOrderedProjection", () => {
  it("rolls back the view write and the ledger together on failure, then converges", async () => {
    const uow = new PrismaUnitOfWork(prisma);
    const real = new ActiveAuctionsProjection(uow);
    let healed = false;
    // writes the view row first, then fails — the write must not survive
    const failsAfterWriting: IProjection = {
      async handle(event, meta) {
        await real.handle(event, meta);
        if (!healed) throw new Error("projection blew up after writing");
      },
    };
    const guarded = new StreamOrderedProjection(
      `rollback-${uuid()}`,
      failsAfterWriting,
      new StreamVersionLedger(uow),
      uow,
    );
    const auctionId = uuid();
    const envelope = created(auctionId, 1, "ACTIVE");

    await expect(guarded.apply(envelope)).rejects.toThrow("blew up");
    expect(await rowOf(auctionId)).toBeUndefined(); // view write rolled back

    healed = true; // the redelivery after a fix converges
    expect(await guarded.apply(envelope)).toBe("applied"); // ledger never moved
    expect(await rowOf(auctionId)).toBeDefined();
    expect(await guarded.apply(envelope)).toBe("duplicate");
  });

  it("applies one version at most once under concurrent deliveries", async () => {
    const uow = new PrismaUnitOfWork(prisma);
    // slow enough that both deliveries read the ledger before either commits
    const slow: IProjection = {
      handle: () => new Promise((resolve) => setTimeout(resolve, 300)),
    };
    const guarded = new StreamOrderedProjection(
      `concurrency-${uuid()}`,
      slow,
      new StreamVersionLedger(uow),
      uow,
    );
    const envelope = created(uuid(), 1, "ACTIVE");

    const results = await Promise.allSettled([
      guarded.apply(envelope),
      guarded.apply(envelope),
    ]);

    const applied = results.filter(
      (r) => r.status === "fulfilled" && r.value === "applied",
    );
    const conflicts = results.filter(
      (r) =>
        r.status === "rejected" &&
        r.reason instanceof StreamVersionConflictError,
    );
    expect(applied).toHaveLength(1);
    expect(conflicts).toHaveLength(1);
    // the conflicting delivery, redelivered, is now a plain duplicate
    expect(await guarded.apply(envelope)).toBe("duplicate");
  });
});

// --- helpers -----------------------------------------------------------------

const publish = (envelope: EventEnvelope) =>
  publishEnvelope(relay.pulsar, TOPICS.auction, envelope);

/**
 * One consumer handles the topic in order (apart from nacked redeliveries),
 * so once a sentinel published now has been projected, everything published
 * before it has been handled.
 */
async function processedEverythingBefore(): Promise<void> {
  const sentinel = uuid();
  await publish(created(sentinel, 1, "ACTIVE"));
  await eventually(
    () => rowOf(sentinel),
    (r) => r !== undefined,
  );
}

function envelope(
  auctionId: string,
  version: number,
  payload: DomainEvent & Record<string, unknown>,
): EventEnvelope {
  return {
    streamType: "auction",
    streamId: auctionId,
    version,
    eventType: payload.eventType,
    payload,
  };
}

function created(auctionId: string, version: number, status: string) {
  return envelope(auctionId, version, {
    eventType: "AuctionCreated",
    occurredAt: new Date(),
    auctionId,
    sellerId: uuid(),
    title: "Synthetic auction",
    status,
    startingPrice: { amount: 100, currency: "PLN" },
    startsAt: new Date(Date.now() + DAY),
    endsAt: new Date(Date.now() + 7 * DAY),
  });
}

function bidPlaced(
  auctionId: string,
  version: number,
  amount: number,
  bidNumber: number,
) {
  return envelope(auctionId, version, {
    eventType: "BidPlaced",
    occurredAt: new Date(),
    auctionId,
    bidderId: uuid(),
    amount: { amount, currency: "PLN" },
    bidNumber,
  });
}

function started(auctionId: string, version: number) {
  return envelope(auctionId, version, {
    eventType: "AuctionStarted",
    occurredAt: new Date(),
    auctionId,
  });
}

function closed(auctionId: string, version: number) {
  return envelope(auctionId, version, {
    eventType: "AuctionClosed",
    occurredAt: new Date(),
    auctionId,
  });
}
