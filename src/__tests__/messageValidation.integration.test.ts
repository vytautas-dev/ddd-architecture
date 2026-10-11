import { randomUUID as uuid } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { MessageId } from "pulsar-client";
import { GetActiveAuctionsHandler } from "../auction/application/queries/GetActiveAuctions";
import { ActiveAuctionsProjection } from "../auction/infrastructure/projections/ActiveAuctionsProjection";
import { PrismaClient } from "../generated/prisma/client";
import type { DomainEvent } from "../shared/domain/DomainEvent";
import type { IProjection } from "../shared/domain/IProjection";
import type { EventEnvelope } from "../shared/infrastructure/messaging/EventEnvelope";
import { ProjectionConsumer } from "../shared/infrastructure/messaging/ProjectionConsumer";
import { createPulsarClient } from "../shared/infrastructure/messaging/pulsar";
import { StreamOrderedProjection } from "../shared/infrastructure/messaging/StreamOrderedProjection";
import { StreamVersionLedger } from "../shared/infrastructure/messaging/StreamVersionLedger";
import {
  deadLetterTopicFor,
  TOPICS,
} from "../shared/infrastructure/messaging/topology";
import { PrismaUnitOfWork } from "../shared/infrastructure/PrismaUnitOfWork";
import { EVENT_SCHEMAS } from "../worker";
import { eventually, publishEnvelope } from "./support/pipeline";

// The worker's boundary: every message is parsed with the publishing
// context's Zod schema before a projection sees it.

const DAY = 24 * 60 * 60 * 1000;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env["DATABASE_URL"] }),
});
const pulsar = createPulsarClient(process.env["PULSAR_URL"]);
const uow = new PrismaUnitOfWork(prisma);
const activeAuctions = new GetActiveAuctionsHandler(prisma);

// the real projection, plus a record of what it was handed
const received: DomainEvent[] = [];
const real = new ActiveAuctionsProjection(uow);
const recording: IProjection = {
  handle(event, meta) {
    received.push(event);
    return real.handle(event, meta);
  },
};
const consumer = new ProjectionConsumer(pulsar, {
  topic: TOPICS.auction,
  subscription: "active-auctions",
  projection: new StreamOrderedProjection(
    "active-auctions",
    recording,
    new StreamVersionLedger(uow),
    uow,
  ),
  eventSchema: EVENT_SCHEMAS[TOPICS.auction],
  nackRedeliveryMs: 100,
  maxRedeliveries: 2,
});

let errors: jest.SpyInstance;
beforeAll(async () => {
  errors = jest.spyOn(console, "error").mockImplementation(() => {});
  await consumer.start();
});

afterAll(async () => {
  await consumer.stop();
  errors.mockRestore();
  await pulsar.close();
  await prisma.$disconnect();
});

const rowOf = async (auctionId: string) =>
  (await activeAuctions.execute()).find((row) => row.id === auctionId);

it("hands projections real Date instances, not ISO strings", async () => {
  const auctionId = uuid();
  await publish(created(auctionId));

  await eventually(
    () => rowOf(auctionId),
    (row) => row !== undefined,
  );
  const event = received.find(
    (e) => (e as { auctionId?: string }).auctionId === auctionId,
  ) as unknown as { occurredAt: unknown; startsAt: unknown; endsAt: unknown };
  expect(event.occurredAt).toBeInstanceOf(Date);
  expect(event.startsAt).toBeInstanceOf(Date);
  expect(event.endsAt).toBeInstanceOf(Date);
});

it("dead-letters malformed messages and keeps consuming", async () => {
  const mistyped = uuid();
  const unknownType = uuid();
  const notJson = uuid();
  const healthy = uuid();

  // a BidPlaced whose amount is not a number
  await publish({
    ...created(mistyped),
    eventType: "BidPlaced",
    payload: {
      eventType: "BidPlaced",
      occurredAt: new Date(),
      auctionId: mistyped,
      bidderId: uuid(),
      amount: { amount: "a lot", currency: "PLN" },
      bidNumber: 1,
    } as unknown as DomainEvent,
  });
  // an event type the Auction schema does not know
  await publish({
    ...created(unknownType),
    eventType: "AuctionRenamed",
    payload: {
      eventType: "AuctionRenamed",
      occurredAt: new Date(),
      auctionId: unknownType,
    } as unknown as DomainEvent,
  });
  // bytes that are not JSON at all
  const producer = await pulsar.createProducer({
    topic: TOPICS.auction,
    batchingEnabled: false,
  });
  await producer.send({ data: Buffer.from("{oops"), partitionKey: notJson });
  await producer.close();
  // and a healthy event after them
  await publish(created(healthy));

  await eventually(
    () => rowOf(healthy),
    (row) => row !== undefined,
  );
  const deadKeys = await eventually(
    () => keysOn(deadLetterTopicFor(TOPICS.auction, "active-auctions")),
    (keys) =>
      [mistyped, unknownType, notJson].every((key) => keys.includes(key)),
    30_000,
  );
  expect(deadKeys).toEqual(
    expect.arrayContaining([mistyped, unknownType, notJson]),
  );
  // none of them reached the projection
  for (const id of [mistyped, unknownType]) {
    expect(await rowOf(id)).toBeUndefined();
  }
}, 60_000);

// --- helpers -----------------------------------------------------------------

const publish = (envelope: EventEnvelope) =>
  publishEnvelope(pulsar, TOPICS.auction, envelope);

/** Message keys on a topic, read without consuming (payloads may not be JSON). */
async function keysOn(topic: string): Promise<string[]> {
  const reader = await pulsar.createReader({
    topic,
    startMessageId: MessageId.earliest(),
  });
  const keys: string[] = [];
  try {
    while (reader.hasNext()) {
      keys.push((await reader.readNext(2_000)).getPartitionKey());
    }
  } finally {
    await reader.close();
  }
  return keys;
}

function created(auctionId: string): EventEnvelope {
  return {
    streamType: "auction",
    streamId: auctionId,
    version: 1,
    eventType: "AuctionCreated",
    payload: {
      eventType: "AuctionCreated",
      occurredAt: new Date(),
      auctionId,
      sellerId: uuid(),
      title: "Validation test auction",
      status: "SCHEDULED",
      startingPrice: { amount: 100, currency: "PLN" },
      startsAt: new Date(Date.now() + DAY),
      endsAt: new Date(Date.now() + 7 * DAY),
    } as DomainEvent,
  };
}
