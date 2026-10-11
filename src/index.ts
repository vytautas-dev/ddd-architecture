import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import express from "express";
import { auctionRouter } from "./auction/api/auctionRouter";
import { domainErrorHandler } from "./auction/api/errorHandler";
import { CancelAuctionHandler } from "./auction/application/commands/CancelAuction";
import { CreateAuctionHandler } from "./auction/application/commands/CreateAuction";
import { PlaceBidHandler } from "./auction/application/commands/PlaceBid";
import { StartAuctionHandler } from "./auction/application/commands/StartAuction";
import { GetActiveAuctionsHandler } from "./auction/application/queries/GetActiveAuctions";
import { AuctionRepository } from "./auction/infrastructure/AuctionRepository";
import { ActiveAuctionsProjection } from "./auction/infrastructure/projections/ActiveAuctionsProjection";
import { PrismaClient } from "./generated/prisma/client";
import { withBehaviors } from "./shared/application/withBehaviors";
import { CatchUpSubscription } from "./shared/infrastructure/CatchUpSubscription";
import { EventStore } from "./shared/infrastructure/EventStore";
import { OutboxEventStore } from "./shared/infrastructure/messaging/OutboxEventStore";
import {
  createOutboxRelay,
  HERMES_SCHEMA,
} from "./shared/infrastructure/messaging/outboxRelay";
import { provisionSubscriptions } from "./shared/infrastructure/messaging/provisionSubscriptions";
import { createPulsarClient } from "./shared/infrastructure/messaging/pulsar";
import { PostgresUnitOfWork } from "./shared/infrastructure/PostgresUnitOfWork";
import { PrismaUnitOfWork } from "./shared/infrastructure/PrismaUnitOfWork";
import { createPostgresClient } from "./shared/infrastructure/postgresClient";
import { watchlistRouter } from "./watchlist/api/watchlistRouter";
import { FavoriteAuctionHandler } from "./watchlist/application/commands/FavoriteAuction";
import { UnfavoriteAuctionHandler } from "./watchlist/application/commands/UnfavoriteAuction";
import { GetMyFavoritesHandler } from "./watchlist/application/queries/GetMyFavorites";
import { AuctionCatalogProjection } from "./watchlist/infrastructure/projections/AuctionCatalogProjection";
import { FavoritesProjection } from "./watchlist/infrastructure/projections/FavoritesProjection";
import { ReadModelAuctionCatalog } from "./watchlist/infrastructure/ReadModelAuctionCatalog";
import { WatchlistRepository } from "./watchlist/infrastructure/WatchlistRepository";

// Infrastructure
const adapter = new PrismaPg({ connectionString: process.env["DATABASE_URL"] });
const prisma = new PrismaClient({ adapter });
// Command side writes the event store through Postgres.js; read models
// (projections, queries) stay on Prisma. Its search_path includes the Hermes
// schema, so outbox rows commit in the command's own transaction.
const commandUow = new PostgresUnitOfWork(
  createPostgresClient(process.env["DATABASE_URL"], {
    extraSchemas: [HERMES_SCHEMA],
  }),
);
// This process is also the outbox relay: Hermes holds its replication slot
// exclusively, so the API runs as a single instance (ADR-0001).
const pulsar = createPulsarClient(process.env["PULSAR_URL"]);
const relay = createOutboxRelay({
  databaseUrl: process.env["DATABASE_URL"],
  pulsar,
  consumerName: "bidflow_api",
});
const readModelUow = new PrismaUnitOfWork(prisma);
const activeAuctionsProjection = new ActiveAuctionsProjection(readModelUow);
const favoritesProjection = new FavoritesProjection(readModelUow);
const auctionCatalogProjection = new AuctionCatalogProjection(readModelUow);
const eventStore = new OutboxEventStore(
  new EventStore(commandUow),
  commandUow,
  relay.outbox,
);
const auctionRepository = new AuctionRepository(eventStore);
const watchlistRepository = new WatchlistRepository(eventStore);
const auctionCatalog = new ReadModelAuctionCatalog(readModelUow);
const readModels = new CatchUpSubscription(
  readModelUow,
  {
    auction: [activeAuctionsProjection, auctionCatalogProjection],
    watchlist: [favoritesProjection],
  },
  "read-models",
);

export const createAuctionHandler = withBehaviors(
  new CreateAuctionHandler(auctionRepository),
  { transaction: commandUow },
);
export const startAuctionHandler = withBehaviors(
  new StartAuctionHandler(auctionRepository),
  { retry: true, transaction: commandUow },
);
export const placeBidHandler = withBehaviors(
  new PlaceBidHandler(auctionRepository),
  { retry: true, transaction: commandUow },
);
export const cancelAuctionHandler = withBehaviors(
  new CancelAuctionHandler(auctionRepository),
  { retry: true, transaction: commandUow },
);
export const getActiveAuctionsHandler = new GetActiveAuctionsHandler(prisma);

export const favoriteAuctionHandler = withBehaviors(
  new FavoriteAuctionHandler(watchlistRepository, auctionCatalog),
  { retry: true, transaction: commandUow },
);
export const unfavoriteAuctionHandler = withBehaviors(
  new UnfavoriteAuctionHandler(watchlistRepository),
  { retry: true, transaction: commandUow },
);
export const getMyFavoritesHandler = new GetMyFavoritesHandler(prisma);

// HTTP Server
const app = express();
app.use(express.json());
app.use(auctionRouter);
app.use(watchlistRouter);
app.use(domainErrorHandler);

// Subscriptions first (Pulsar keeps nothing for a topic without one), then the
// relay (commands need a started outbox), then traffic.
async function start(): Promise<void> {
  await provisionSubscriptions(pulsar);
  await relay.start();
  const PORT = process.env["PORT"] ?? 3000;
  app.listen(PORT, () => {
    console.log(`BidFlow running on http://localhost:${PORT}`);
  });
  readModels.start();
}

start().catch((error) => {
  console.error("BidFlow failed to start", error);
  process.exit(1);
});
