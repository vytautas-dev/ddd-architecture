import "dotenv/config";
import express from "express";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";
import { EventStore } from "./shared/infrastructure/EventStore";
import { AuctionRepository } from "./auction/infrastructure/AuctionRepository";
import { ActiveAuctionsProjection } from "./auction/infrastructure/projections/ActiveAuctionsProjection";
import { CreateAuctionHandler } from "./auction/application/commands/CreateAuction";
import { PlaceBidHandler } from "./auction/application/commands/PlaceBid";
import { CancelAuctionHandler } from "./auction/application/commands/CancelAuction";
import { GetActiveAuctionsHandler } from "./auction/application/queries/GetActiveAuctions";
import { auctionRouter } from "./auction/api/auctionRouter";
import { watchlistRouter } from "./watchlist/api/watchlistRouter";
import { domainErrorHandler } from "./auction/api/errorHandler";
import { StartAuctionHandler } from "./auction/application/commands/StartAuction";
import { WatchlistRepository } from "./watchlist/infrastructure/WatchlistRepository";
import { FavoritesProjection } from "./watchlist/infrastructure/projections/FavoritesProjection";
import { FavoriteAuctionHandler } from "./watchlist/application/commands/FavoriteAuction";
import { UnfavoriteAuctionHandler } from "./watchlist/application/commands/UnfavoriteAuction";
import { GetMyFavoritesHandler } from "./watchlist/application/queries/GetMyFavorites";
import { withBehaviors } from "./shared/application/withBehaviors";
import { PrismaUnitOfWork } from "./shared/infrastructure/PrismaUnitOfWork";

// Infrastructure
const adapter = new PrismaPg({ connectionString: process.env["DATABASE_URL"] });
const prisma = new PrismaClient({ adapter });
const uow = new PrismaUnitOfWork(prisma);
const activeAuctionsProjection = new ActiveAuctionsProjection(uow);
const favoritesProjection = new FavoritesProjection(uow);
const eventStore = new EventStore(uow, {
  auction: [activeAuctionsProjection, favoritesProjection],
  watchlist: [favoritesProjection],
});
const auctionRepository = new AuctionRepository(eventStore);
const watchlistRepository = new WatchlistRepository(eventStore);

export const createAuctionHandler = withBehaviors(
  new CreateAuctionHandler(auctionRepository),
  { transaction: uow },
);
export const startAuctionHandler = withBehaviors(
  new StartAuctionHandler(auctionRepository),
  { retry: true, transaction: uow },
);
export const placeBidHandler = withBehaviors(
  new PlaceBidHandler(auctionRepository),
  { retry: true, transaction: uow },
);
export const cancelAuctionHandler = withBehaviors(
  new CancelAuctionHandler(auctionRepository),
  { retry: true, transaction: uow },
);
export const getActiveAuctionsHandler = new GetActiveAuctionsHandler(prisma);

export const favoriteAuctionHandler = withBehaviors(
  new FavoriteAuctionHandler(watchlistRepository, uow),
  { retry: true, transaction: uow },
);
export const unfavoriteAuctionHandler = withBehaviors(
  new UnfavoriteAuctionHandler(watchlistRepository),
  { retry: true, transaction: uow },
);
export const getMyFavoritesHandler = new GetMyFavoritesHandler(prisma);

// HTTP Server
const app = express();
app.use(express.json());
app.use(auctionRouter);
app.use(watchlistRouter);
app.use(domainErrorHandler);

const PORT = process.env["PORT"] ?? 3000;
app.listen(PORT, () => {
  console.log(`BidFlow running on http://localhost:${PORT}`);
});
