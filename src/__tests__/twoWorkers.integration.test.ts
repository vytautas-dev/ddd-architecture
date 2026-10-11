import { randomUUID as uuid } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { CreateAuctionHandler } from "../auction/application/commands/CreateAuction";
import { PlaceBidHandler } from "../auction/application/commands/PlaceBid";
import { StartAuctionHandler } from "../auction/application/commands/StartAuction";
import { GetActiveAuctionsHandler } from "../auction/application/queries/GetActiveAuctions";
import { AuctionRepository } from "../auction/infrastructure/AuctionRepository";
import { PrismaClient } from "../generated/prisma/client";
import { withBehaviors } from "../shared/application/withBehaviors";
import { EventStore } from "../shared/infrastructure/EventStore";
import { OutboxEventStore } from "../shared/infrastructure/messaging/OutboxEventStore";
import { HERMES_SCHEMA } from "../shared/infrastructure/messaging/outboxRelay";
import { createPulsarClient } from "../shared/infrastructure/messaging/pulsar";
import { PROJECTION_SUBSCRIPTIONS } from "../shared/infrastructure/messaging/topology";
import { PostgresUnitOfWork } from "../shared/infrastructure/PostgresUnitOfWork";
import { createPostgresClient } from "../shared/infrastructure/postgresClient";
import { FavoriteAuctionHandler } from "../watchlist/application/commands/FavoriteAuction";
import { GetMyFavoritesHandler } from "../watchlist/application/queries/GetMyFavorites";
import { ReadModelAuctionCatalog } from "../watchlist/infrastructure/ReadModelAuctionCatalog";
import { WatchlistRepository } from "../watchlist/infrastructure/WatchlistRepository";
import { createWorker } from "../worker";
import {
  deliveriesPerConsumer,
  eventually,
  startRelay,
} from "./support/pipeline";

// Scenario 4: two worker instances share every subscription (Key_Shared)
// while many bids land on many auctions at once. Each view must still end
// exactly where the event store does.

const DAY = 24 * 60 * 60 * 1000;
const AUCTIONS = 20; // enough keys that both workers get a share
const BIDS = [110, 120, 130, 140, 150];

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env["DATABASE_URL"] }),
});
const sql = createPostgresClient(process.env["DATABASE_URL"], {
  extraSchemas: [HERMES_SCHEMA],
});
const commandUow = new PostgresUnitOfWork(sql);
const auctionCatalog = new ReadModelAuctionCatalog(prisma);
const secondPulsar = createPulsarClient(process.env["PULSAR_URL"]);
let relay: Awaited<ReturnType<typeof startRelay>>;
let workers: ReturnType<typeof createWorker>[] = [];

beforeAll(async () => {
  relay = await startRelay();
  // two processes' worth: separate Pulsar clients, separate consumers
  workers = [
    createWorker({ prisma, pulsar: relay.pulsar, nackRedeliveryMs: 200 }),
    createWorker({ prisma, pulsar: secondPulsar, nackRedeliveryMs: 200 }),
  ];
  await Promise.all(workers.map((worker) => worker.start()));
});

afterAll(async () => {
  await Promise.all(workers.map((worker) => worker.stop()));
  await secondPulsar.close();
  await relay.stop();
  await sql.end();
  await prisma.$disconnect();
});

it("keeps every view correct with two workers sharing the load (scenario 4)", async () => {
  const eventStore = new OutboxEventStore(
    new EventStore(commandUow),
    commandUow,
    relay.outbox,
  );
  const auctions = new AuctionRepository(eventStore);
  const tx = { retry: true, transaction: commandUow };
  const createAuction = withBehaviors(new CreateAuctionHandler(auctions), tx);
  const startAuction = withBehaviors(new StartAuctionHandler(auctions), tx);
  const placeBid = withBehaviors(new PlaceBidHandler(auctions), tx);
  const favoriteAuction = withBehaviors(
    new FavoriteAuctionHandler(
      new WatchlistRepository(eventStore),
      auctionCatalog,
    ),
    tx,
  );

  const lots = Array.from({ length: AUCTIONS }, () => ({
    auctionId: uuid(),
    watcherId: uuid(), // one watcher per auction, so favorites spread over keys too
  }));

  await Promise.all(
    lots.map(async ({ auctionId, watcherId }) => {
      await createAuction.execute({
        auctionId,
        sellerId: uuid(),
        title: `Lot ${auctionId.slice(0, 8)}`,
        startingPrice: { amount: 100, currency: "PLN" },
        startsAt: new Date(Date.now() + DAY),
        endsAt: new Date(Date.now() + 7 * DAY),
      });
      // favoriting asks the (eventually consistent) catalog for the auction
      await eventually(
        () => auctionCatalog.findForFavoriting(auctionId),
        (a) => a.exists,
      );
      await favoriteAuction.execute({ bidderId: watcherId, auctionId });
      await startAuction.execute({ auctionId });
      for (const amount of BIDS) {
        await placeBid.execute({
          auctionId,
          bidderId: uuid(),
          amount: { amount, currency: "PLN" },
        });
      }
    }),
  );

  const finalBid = BIDS[BIDS.length - 1];
  const getActive = new GetActiveAuctionsHandler(prisma);
  const getFavorites = new GetMyFavoritesHandler(prisma);

  // active auctions: every lot at its last bid
  const ids = new Set<string>(lots.map((lot) => lot.auctionId));
  const rows = await eventually(
    async () => (await getActive.execute()).filter((row) => ids.has(row.id)),
    (found) =>
      found.length === AUCTIONS &&
      found.every(
        (row) => row.currentBid === finalBid && row.totalBids === BIDS.length,
      ),
    30_000,
  );
  expect(rows).toHaveLength(AUCTIONS);

  // catalog + favorites: every watcher sees the auction ACTIVE at its last bid
  for (const { auctionId, watcherId } of lots) {
    const [favorite] = await eventually(
      () => getFavorites.execute({ bidderId: watcherId }),
      (found) =>
        found[0]?.status === "ACTIVE" && found[0].currentBid === finalBid,
      30_000,
    );
    expect(favorite?.auctionId).toBe(auctionId);
  }

  // and the work really was shared: both consumers of every subscription
  // received messages
  for (const { topic, subscription } of PROJECTION_SUBSCRIPTIONS) {
    const deliveries = await deliveriesPerConsumer(topic, subscription);
    expect(deliveries).toHaveLength(2);
    expect(deliveries.every((count) => count > 0)).toBe(true);
  }
}, 120_000);
