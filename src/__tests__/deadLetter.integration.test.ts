import { randomUUID as uuid } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { GetActiveAuctionsHandler } from "../auction/application/queries/GetActiveAuctions";
import { ActiveAuctionsProjection } from "../auction/infrastructure/projections/ActiveAuctionsProjection";
import { PrismaClient } from "../generated/prisma/client";
import type { DomainEvent } from "../shared/domain/DomainEvent";
import type { IProjection } from "../shared/domain/IProjection";
import type { EventEnvelope } from "../shared/infrastructure/messaging/EventEnvelope";
import { ProjectionConsumer } from "../shared/infrastructure/messaging/ProjectionConsumer";
import { createPulsarClient } from "../shared/infrastructure/messaging/pulsar";
import { replayDeadLetters } from "../shared/infrastructure/messaging/replayDeadLetters";
import { StreamOrderedProjection } from "../shared/infrastructure/messaging/StreamOrderedProjection";
import { StreamVersionLedger } from "../shared/infrastructure/messaging/StreamVersionLedger";
import {
  deadLetterTopicFor,
  type ProjectionSubscriptionName,
  TOPICS,
  type Topic,
} from "../shared/infrastructure/messaging/topology";
import { PrismaUnitOfWork } from "../shared/infrastructure/PrismaUnitOfWork";
import { GetMyFavoritesHandler } from "../watchlist/application/queries/GetMyFavorites";
import { AuctionCatalogProjection } from "../watchlist/infrastructure/projections/AuctionCatalogProjection";
import { FavoritesProjection } from "../watchlist/infrastructure/projections/FavoritesProjection";
import { envelopesOn, eventually, publishEnvelope } from "./support/pipeline";

// Scenarios 3 and 10: a poison event lands in the dead-letter topic instead of
// spinning forever, freezes only its own stream in its own projection, and
// comes back with dlq:replay once the projection is fixed.

const DAY = 24 * 60 * 60 * 1000;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env["DATABASE_URL"] }),
});
const pulsar = createPulsarClient(process.env["PULSAR_URL"]);
const uow = new PrismaUnitOfWork(prisma);
const ledger = new StreamVersionLedger(uow);
const activeAuctions = new GetActiveAuctionsHandler(prisma);
const favorites = new GetMyFavoritesHandler(prisma);

// The active-auctions projection chokes on version 2 of one auction until
// "fixed"; every other projection and stream is healthy.
const poisoned = uuid();
let fixed = false;
const real = new ActiveAuctionsProjection(uow);
const choking: IProjection = {
  handle(event, meta) {
    if (!fixed && meta.streamId === poisoned && meta.version === 2) {
      return Promise.reject(
        new Error("active-auctions cannot handle this event"),
      );
    }
    return real.handle(event, meta);
  },
};

let consumers: ProjectionConsumer[] = [];

async function startWorker(): Promise<void> {
  const consumer = (
    topic: Topic,
    subscription: ProjectionSubscriptionName,
    projection: IProjection,
  ) =>
    new ProjectionConsumer(pulsar, {
      topic,
      subscription,
      projection: new StreamOrderedProjection(
        subscription,
        projection,
        ledger,
        uow,
      ),
      nackRedeliveryMs: 100,
      maxRedeliveries: 2,
    });
  consumers = [
    consumer(TOPICS.auction, "active-auctions", choking),
    consumer(
      TOPICS.auction,
      "watchlist-auction-catalog",
      new AuctionCatalogProjection(uow),
    ),
    consumer(
      TOPICS.watchlist,
      "watchlist-favorites",
      new FavoritesProjection(uow),
    ),
  ];
  await Promise.all(consumers.map((c) => c.start()));
}

async function stopWorker(): Promise<void> {
  await Promise.all(consumers.map((c) => c.stop()));
  consumers = [];
}

let errors: jest.SpyInstance;
beforeAll(async () => {
  errors = jest.spyOn(console, "error").mockImplementation(() => {});
  await startWorker();
});

afterAll(async () => {
  await stopWorker();
  errors.mockRestore();
  await pulsar.close();
  await prisma.$disconnect();
});

const rowOf = async (auctionId: string) =>
  (await activeAuctions.execute()).find((row) => row.id === auctionId);
const watcher = uuid();
const healthy = uuid();
const deadLetters = () =>
  envelopesOn(pulsar, deadLetterTopicFor(TOPICS.auction, "active-auctions"));

it("dead-letters a poison event and the rest of its stream; everything else keeps going (scenario 3)", async () => {
  await publish(created(poisoned, 1));
  await publish(bidPlaced(poisoned, 2, 120, 1)); // the poison
  await publish(bidPlaced(poisoned, 3, 130, 2)); // waits on 2, then dead-letters too
  await publishEnvelope(pulsar, TOPICS.watchlist, favorited(watcher, poisoned));
  await publish(created(healthy, 1));
  await publish(bidPlaced(healthy, 2, 200, 1));

  // another auction, same projection: unaffected
  await eventually(
    () => rowOf(healthy),
    (r) => r?.currentBid === 200,
  );
  // same auction, other projections (catalog → favorites): unaffected
  await eventually(
    () => favorites.execute({ bidderId: watcher }),
    (f) => f[0]?.currentBid === 130,
  );
  // the poison and its successor are set aside, in order
  const dead = await eventually(
    async () => (await deadLetters()).filter((e) => e.streamId === poisoned),
    (found) => found.length === 2,
    30_000,
  );
  expect(dead.map((e) => e.version)).toEqual([2, 3]);
  // the stream is frozen at version 1 in this projection only
  expect(await rowOf(poisoned)).toMatchObject({
    currentBid: null,
    totalBids: 0,
  });

  // and the consumer is still alive
  await publish(bidPlaced(healthy, 3, 210, 2));
  await eventually(
    () => rowOf(healthy),
    (r) => r?.currentBid === 210,
  );
}, 60_000);

it("replays dead letters after the fix, and other views ignore the copies (scenario 10)", async () => {
  // dead letters survive a restart of the consumers
  await stopWorker();
  await startWorker();
  fixed = true;

  // catalog/favorites already hold the final state; watch that the replayed
  // copies never move it backwards
  const seen: Array<number | null | undefined> = [];
  const watch = setInterval(() => {
    void favorites
      .execute({ bidderId: watcher })
      .then((f) => seen.push(f[0]?.currentBid));
  }, 20);

  const replayed = await replayDeadLetters(pulsar, "active-auctions");

  const row = await eventually(
    () => rowOf(poisoned),
    (r) => r?.totalBids === 2,
  );
  clearInterval(watch);

  expect(replayed).toBeGreaterThanOrEqual(2);
  expect(row).toMatchObject({ currentBid: 130, totalBids: 2 });
  expect(seen.length).toBeGreaterThan(0);
  expect(seen.every((bid) => bid === 130)).toBe(true);
}, 60_000);

// --- helpers -----------------------------------------------------------------

const publish = (envelope: EventEnvelope) =>
  publishEnvelope(pulsar, TOPICS.auction, envelope);

function auctionEnvelope(
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

function created(auctionId: string, version: number) {
  return auctionEnvelope(auctionId, version, {
    eventType: "AuctionCreated",
    occurredAt: new Date(),
    auctionId,
    sellerId: uuid(),
    title: "Dead-letter test auction",
    status: "SCHEDULED",
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
  return auctionEnvelope(auctionId, version, {
    eventType: "BidPlaced",
    occurredAt: new Date(),
    auctionId,
    bidderId: uuid(),
    amount: { amount, currency: "PLN" },
    bidNumber,
  });
}

function favorited(bidderId: string, auctionId: string): EventEnvelope {
  return {
    streamType: "watchlist",
    streamId: bidderId,
    version: 1,
    eventType: "AuctionFavorited",
    payload: {
      eventType: "AuctionFavorited",
      occurredAt: new Date(),
      bidderId,
      auctionId,
    } as EventEnvelope["payload"],
  };
}
