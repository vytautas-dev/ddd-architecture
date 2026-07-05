import "dotenv/config";
import { randomUUID as uuid } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../generated/prisma/client";
import { EventStore } from "../EventStore";
import { PrismaUnitOfWork } from "../PrismaUnitOfWork";
import { withBehaviors } from "../../application/withBehaviors";
import type { IProjection } from "../../domain/IProjection";
import { AuctionRepository } from "../../../auction/infrastructure/AuctionRepository";
import { ActiveAuctionsProjection } from "../../../auction/infrastructure/projections/ActiveAuctionsProjection";
import { CreateAuctionHandler } from "../../../auction/application/commands/CreateAuction";

const DAY = 24 * 60 * 60 * 1000;

const adapter = new PrismaPg({ connectionString: process.env["DATABASE_URL"] });
const prisma = new PrismaClient({ adapter });
const uow = new PrismaUnitOfWork(prisma);

class FailingProjection implements IProjection {
  async handle(): Promise<void> {
    throw new Error("projection blew up");
  }
}

function buildCreateAuction(
  projections: IProjection[],
  transactional: boolean,
) {
  const eventStore = new EventStore(uow, { auction: projections });
  const handler = new CreateAuctionHandler(new AuctionRepository(eventStore));
  return transactional ? withBehaviors(handler, { transaction: uow }) : handler;
}

function createAuctionCommand() {
  return {
    auctionId: uuid(),
    sellerId: uuid(),
    title: "Atomicity test auction",
    startingPrice: { amount: 100, currency: "USD" },
    startsAt: new Date(Date.now() + DAY),
    endsAt: new Date(Date.now() + 7 * DAY),
  };
}

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "event_store", "active_auctions_view", "favorites_view"',
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Atomicity — events + projections (integration)", () => {
  it("commits events and projection writes together on success", async () => {
    const createAuction = buildCreateAuction(
      [new ActiveAuctionsProjection(uow)],
      true,
    );
    const command = createAuctionCommand();

    await createAuction.execute(command);

    expect(await prisma.eventStore.count()).toBe(1);
    expect(
      await prisma.activeAuctionView.findUnique({
        where: { id: command.auctionId },
      }),
    ).not.toBeNull();
  });

  it("rolls back the event when a projection fails inside the transaction", async () => {
    const createAuction = buildCreateAuction(
      [new FailingProjection(), new ActiveAuctionsProjection(uow)],
      true,
    );
    const command = createAuctionCommand();

    await expect(createAuction.execute(command)).rejects.toThrow(
      "projection blew up",
    );

    expect(
      await prisma.eventStore.count({ where: { streamId: command.auctionId } }),
    ).toBe(0);
    expect(
      await prisma.activeAuctionView.count({
        where: { id: command.auctionId },
      }),
    ).toBe(0);
  });

  it("DOCUMENTS THE BUG: without a transaction the same failure leaves the event persisted but the view stale", async () => {
    const createAuction = buildCreateAuction(
      [new FailingProjection(), new ActiveAuctionsProjection(uow)],
      false,
    );
    const command = createAuctionCommand();

    await expect(createAuction.execute(command)).rejects.toThrow(
      "projection blew up",
    );

    expect(
      await prisma.eventStore.count({ where: { streamId: command.auctionId } }),
    ).toBe(1);
    expect(
      await prisma.activeAuctionView.count({
        where: { id: command.auctionId },
      }),
    ).toBe(0);
  });
});
