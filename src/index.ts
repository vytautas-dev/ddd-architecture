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
import { domainErrorHandler } from "./auction/api/errorHandler";
import { StartAuctionHandler } from "./auction/application/commands/StartAuction";

// Infrastructure
const adapter = new PrismaPg({ connectionString: process.env["DATABASE_URL"] });
const prisma = new PrismaClient({ adapter });
const activeAuctionsProjection = new ActiveAuctionsProjection(prisma);
const eventStore = new EventStore(prisma, {
  auction: [activeAuctionsProjection],
});
const auctionRepository = new AuctionRepository(eventStore);

// Command Handlers
export const createAuctionHandler = new CreateAuctionHandler(auctionRepository);
export const startAuctionHandler = new StartAuctionHandler(auctionRepository);
export const placeBidHandler = new PlaceBidHandler(auctionRepository);
export const cancelAuctionHandler = new CancelAuctionHandler(auctionRepository);
export const getActiveAuctionsHandler = new GetActiveAuctionsHandler(prisma);

// HTTP Server
const app = express();
app.use(express.json());
app.use(auctionRouter);
app.use(domainErrorHandler);

const PORT = process.env["PORT"] ?? 3000;
app.listen(PORT, () => {
  console.log(`BidFlow running on http://localhost:${PORT}`);
});
