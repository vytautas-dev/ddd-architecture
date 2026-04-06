import "dotenv/config";
import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaEventStore } from "./auction/infrastructure/PrismaEventStore";
import { AuctionRepository } from "./auction/infrastructure/AuctionRepository";
import { ActiveAuctionsProjection } from "./auction/infrastructure/projections/ActiveAuctionsProjection";
import { CreateAuctionHandler } from "./auction/application/commands/CreateAuction";
import { PlaceBidHandler } from "./auction/application/commands/PlaceBid";
import { CancelAuctionHandler } from "./auction/application/commands/CancelAuction";

// Infrastructure
const adapter = new PrismaPg({ connectionString: process.env["DATABASE_URL"] });
const prisma = new PrismaClient({ adapter });
const activeAuctionsProjection = new ActiveAuctionsProjection(prisma);
const eventStore = new PrismaEventStore(prisma, [activeAuctionsProjection]);
const auctionRepository = new AuctionRepository(eventStore);

// Command Handlers
export const createAuctionHandler = new CreateAuctionHandler(auctionRepository);
export const placeBidHandler = new PlaceBidHandler(auctionRepository);
export const cancelAuctionHandler = new CancelAuctionHandler(auctionRepository);
