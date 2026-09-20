import "dotenv/config";
import { randomUUID as uuid } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { CreateAuctionHandler } from "../../../auction/application/commands/CreateAuction";
import { AuctionRepository } from "../../../auction/infrastructure/AuctionRepository";
import { ActiveAuctionsProjection } from "../../../auction/infrastructure/projections/ActiveAuctionsProjection";
import { PrismaClient } from "../../../generated/prisma/client";
import { withBehaviors } from "../../application/withBehaviors";
import type { IProjection } from "../../domain/IProjection";
import { CatchUpSubscription } from "../CatchUpSubscription";
import { EventStore } from "../EventStore";
import { PrismaUnitOfWork } from "../PrismaUnitOfWork";

const DAY = 24 * 60 * 60 * 1000;

const adapter = new PrismaPg({ connectionString: process.env["DATABASE_URL"] });
const prisma = new PrismaClient({ adapter });
const uow = new PrismaUnitOfWork(prisma);

/** Throws until `healed` is set, so a test can watch redelivery converge. */
class FlakyProjection implements IProjection {
  healed = false;

  async handle(): Promise<void> {
    if (!this.healed) {
      throw new Error("projection blew up");
    }
  }
}

const createAuction = withBehaviors(
  new CreateAuctionHandler(new AuctionRepository(new EventStore(uow))),
  { transaction: uow },
);

function subscriptionWith(projections: IProjection[]): CatchUpSubscription {
  return new CatchUpSubscription(uow, { auction: projections }, "read-models");
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

function checkpoint() {
  return prisma.projectionCheckpoint.findUnique({
    where: { subscriberName: "read-models" },
  });
}

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "event_store", "active_auctions_view", "favorites_view", "watchlist_auction_catalog_view", "projection_checkpoints"',
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Atomicity — events, projections and the checkpoint (integration)", () => {
  it("commits the command before any projection has run", async () => {
    const subscription = subscriptionWith([new ActiveAuctionsProjection(uow)]);
    const command = createAuctionCommand();

    await createAuction.execute(command);

    // the command is done, the read model has not caught up yet
    expect(await prisma.eventStore.count()).toBe(1);
    expect(
      await prisma.activeAuctionView.count({
        where: { id: command.auctionId },
      }),
    ).toBe(0);

    expect(await subscription.runOnce()).toBe(1);
    expect(
      await prisma.activeAuctionView.findUnique({
        where: { id: command.auctionId },
      }),
    ).not.toBeNull();
  });

  // The guarantee this file used to assert, inverted on purpose: projections
  // left the command transaction, so they can no longer veto a command.
  it("does not roll back the command when a projection fails", async () => {
    const subscription = subscriptionWith([new FlakyProjection()]);
    const command = createAuctionCommand();

    await createAuction.execute(command);

    await expect(subscription.runOnce()).rejects.toThrow("projection blew up");

    expect(
      await prisma.eventStore.count({ where: { streamId: command.auctionId } }),
    ).toBe(1);
  });

  it("rolls back earlier projection writes and the checkpoint together", async () => {
    // the healthy projection writes first, then the second one blows up
    const subscription = subscriptionWith([
      new ActiveAuctionsProjection(uow),
      new FlakyProjection(),
    ]);
    const command = createAuctionCommand();
    await createAuction.execute(command);

    await expect(subscription.runOnce()).rejects.toThrow("projection blew up");

    expect(
      await prisma.activeAuctionView.count({
        where: { id: command.auctionId },
      }),
    ).toBe(0);
    expect(await checkpoint()).toBeNull();
  });

  it("redelivers the event until the projection stops failing", async () => {
    const flaky = new FlakyProjection();
    const subscription = subscriptionWith([
      new ActiveAuctionsProjection(uow),
      flaky,
    ]);
    const command = createAuctionCommand();
    await createAuction.execute(command);

    await expect(subscription.runOnce()).rejects.toThrow("projection blew up");

    // the checkpoint never moved, so the same event is read again — and the
    // healthy projection applying it twice is exactly what idempotency buys
    flaky.healed = true;
    expect(await subscription.runOnce()).toBe(1);

    expect(
      await prisma.activeAuctionView.findUnique({
        where: { id: command.auctionId },
      }),
    ).not.toBeNull();
    // TRUNCATE does not reset the BIGSERIAL, so assert against the log itself
    // rather than a literal: the checkpoint has caught up with the last event
    const lastEvent = await prisma.eventStore.findFirstOrThrow({
      orderBy: { position: "desc" },
    });
    expect((await checkpoint())?.position).toBe(lastEvent.position);
  });
});
