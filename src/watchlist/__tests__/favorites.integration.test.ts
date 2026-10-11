import { randomUUID as uuid } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  eventually,
  publishEnvelope,
  startRelay,
} from "../../__tests__/support/pipeline";
import { CancelAuctionHandler } from "../../auction/application/commands/CancelAuction";
import { CreateAuctionHandler } from "../../auction/application/commands/CreateAuction";
import { PlaceBidHandler } from "../../auction/application/commands/PlaceBid";
import { StartAuctionHandler } from "../../auction/application/commands/StartAuction";
import { GetActiveAuctionsHandler } from "../../auction/application/queries/GetActiveAuctions";
import { AuctionRepository } from "../../auction/infrastructure/AuctionRepository";
import { ActiveAuctionsProjection } from "../../auction/infrastructure/projections/ActiveAuctionsProjection";
import { PrismaClient } from "../../generated/prisma/client";
import { withBehaviors } from "../../shared/application/withBehaviors";
import type { IProjection } from "../../shared/domain/IProjection";
import { EventStore } from "../../shared/infrastructure/EventStore";
import type { EventEnvelope } from "../../shared/infrastructure/messaging/EventEnvelope";
import { OutboxEventStore } from "../../shared/infrastructure/messaging/OutboxEventStore";
import { HERMES_SCHEMA } from "../../shared/infrastructure/messaging/outboxRelay";
import { ProjectionConsumer } from "../../shared/infrastructure/messaging/ProjectionConsumer";
import { StreamOrderedProjection } from "../../shared/infrastructure/messaging/StreamOrderedProjection";
import { StreamVersionLedger } from "../../shared/infrastructure/messaging/StreamVersionLedger";
import { TOPICS } from "../../shared/infrastructure/messaging/topology";
import { PostgresUnitOfWork } from "../../shared/infrastructure/PostgresUnitOfWork";
import { PrismaUnitOfWork } from "../../shared/infrastructure/PrismaUnitOfWork";
import { createPostgresClient } from "../../shared/infrastructure/postgresClient";
import { createWorker, EVENT_SCHEMAS } from "../../worker";
import { FavoriteAuctionHandler } from "../application/commands/FavoriteAuction";
import { UnfavoriteAuctionHandler } from "../application/commands/UnfavoriteAuction";
import { GetMyFavoritesHandler } from "../application/queries/GetMyFavorites";
import {
  AuctionAlreadyFavoritedError,
  AuctionNotUpcomingError,
  AuctionToFavoriteNotFoundError,
} from "../domain/WatchlistErrors";
import { FavoritesProjection } from "../infrastructure/projections/FavoritesProjection";
import { ReadModelAuctionCatalog } from "../infrastructure/ReadModelAuctionCatalog";
import { WatchlistRepository } from "../infrastructure/WatchlistRepository";

const DAY = 24 * 60 * 60 * 1000;

// Ten sam graf obiektów co index.ts + worker.ts (bez HTTP): komendy idą przez
// outbox do Pulsara, a widoki buduje worker — testy czekają na stan widoku
// zamiast przewijać log.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env["DATABASE_URL"] }),
});
const sql = createPostgresClient(process.env["DATABASE_URL"], {
  extraSchemas: [HERMES_SCHEMA],
});
const commandUow = new PostgresUnitOfWork(sql);
const auctionCatalog = new ReadModelAuctionCatalog(prisma);
const getMyFavorites = new GetMyFavoritesHandler(prisma);
const getActiveAuctions = new GetActiveAuctionsHandler(prisma);
let relay: Awaited<ReturnType<typeof startRelay>>;
let stopWorker: (() => Promise<void>) | undefined;

beforeAll(async () => {
  relay = await startRelay();
});

afterEach(async () => {
  await stopWorker?.();
  stopWorker = undefined;
});

afterAll(async () => {
  await relay.stop();
  await sql.end();
  await prisma.$disconnect();
});

async function startWorker(): Promise<void> {
  const worker = createWorker({
    prisma,
    pulsar: relay.pulsar,
    nackRedeliveryMs: 200,
  });
  await worker.start();
  stopWorker = () => worker.stop();
}

function commands() {
  const eventStore = new OutboxEventStore(
    new EventStore(commandUow),
    commandUow,
    relay.outbox,
  );
  const auctions = new AuctionRepository(eventStore);
  const watchlists = new WatchlistRepository(eventStore);
  const tx = { transaction: commandUow };
  const retryTx = { retry: true, transaction: commandUow };
  return {
    createAuction: withBehaviors(new CreateAuctionHandler(auctions), tx),
    startAuction: withBehaviors(new StartAuctionHandler(auctions), retryTx),
    cancelAuction: withBehaviors(new CancelAuctionHandler(auctions), retryTx),
    placeBid: withBehaviors(new PlaceBidHandler(auctions), retryTx),
    favoriteAuction: withBehaviors(
      new FavoriteAuctionHandler(watchlists, auctionCatalog),
      retryTx,
    ),
    unfavoriteAuction: withBehaviors(
      new UnfavoriteAuctionHandler(watchlists),
      retryTx,
    ),
  };
}

/** Creates an auction and waits until the Watchlist catalog knows it. */
async function createScheduledAuction(
  title = "Vintage chair",
): Promise<string> {
  const auctionId = uuid();
  await commands().createAuction.execute({
    auctionId,
    sellerId: uuid(),
    title,
    startingPrice: { amount: 100, currency: "USD" },
    endsAt: new Date(Date.now() + 7 * DAY),
    startsAt: new Date(Date.now() + DAY), // przyszłość → SCHEDULED
  });
  await eventually(
    () => auctionCatalog.findForFavoriting(auctionId),
    (a) => a.exists,
  );
  return auctionId;
}

/** Waits until the catalog no longer treats the auction as upcoming. */
const catalogNotUpcoming = (auctionId: string) =>
  eventually(
    () => auctionCatalog.findForFavoriting(auctionId),
    (a) => a.exists && !a.isUpcoming,
  );

describe("Favorites — integration (commands → Pulsar → worker → views)", () => {
  beforeEach(startWorker);

  it("full lifecycle: create(SCHEDULED) → favorite → start → bid → filter → unfavorite", async () => {
    const { favoriteAuction, startAuction, placeBid, unfavoriteAuction } =
      commands();
    const bidderId = uuid();
    const auctionId = await createScheduledAuction();

    await favoriteAuction.execute({ bidderId, auctionId });
    const favorites = await eventually(
      () => getMyFavorites.execute({ bidderId }),
      (f) => f.length === 1,
    );
    expect(favorites[0]).toMatchObject({
      auctionId,
      status: "SCHEDULED",
      title: "Vintage chair",
    });

    // start aukcji — favorites_view nie jest ruszany, nowy status przychodzi
    // z katalogu przez join przy odczycie
    await startAuction.execute({ auctionId });
    const active = await eventually(
      () => getMyFavorites.execute({ bidderId, status: "ACTIVE" }),
      (f) => f.length === 1,
    );
    expect(active[0]?.status).toBe("ACTIVE");
    expect(
      await getMyFavorites.execute({ bidderId, status: "SCHEDULED" }),
    ).toHaveLength(0);

    // oferta — nowa cena też przychodzi z katalogu (scenariusz 1)
    await placeBid.execute({
      auctionId,
      bidderId: uuid(),
      amount: { amount: 175, currency: "USD" },
    });
    await eventually(
      () => getMyFavorites.execute({ bidderId }),
      (f) => f[0]?.currentBid === 175,
    );

    await unfavoriteAuction.execute({ bidderId, auctionId });
    await eventually(
      () => getMyFavorites.execute({ bidderId }),
      (f) => f.length === 0,
    );
  });

  it("rejects favoriting an auction that is not upcoming (already ACTIVE)", async () => {
    const { favoriteAuction, startAuction } = commands();
    const auctionId = await createScheduledAuction();
    await startAuction.execute({ auctionId }); // → ACTIVE
    // dopóki katalog nie nadgoni, wciąż mówi SCHEDULED — reguła domenowa czyta
    // model eventually consistent
    await catalogNotUpcoming(auctionId);

    await expect(
      favoriteAuction.execute({ bidderId: uuid(), auctionId }),
    ).rejects.toThrow(AuctionNotUpcomingError);
  });

  // Regression: the catalog keeps cancelled auctions (unlike active_auctions_view,
  // which deletes the row) so a cancelled auction is reported as "not upcoming"
  // rather than "not found".
  it("rejects favoriting a cancelled auction as not-upcoming, not as missing", async () => {
    const { favoriteAuction, cancelAuction } = commands();
    const auctionId = await createScheduledAuction();
    await cancelAuction.execute({ auctionId });
    await catalogNotUpcoming(auctionId);

    await expect(
      favoriteAuction.execute({ bidderId: uuid(), auctionId }),
    ).rejects.toThrow(AuctionNotUpcomingError);
  });

  it("rejects favoriting a non-existent auction", async () => {
    await expect(
      commands().favoriteAuction.execute({
        bidderId: uuid(),
        auctionId: uuid(),
      }),
    ).rejects.toThrow(AuctionToFavoriteNotFoundError);
  });

  it("rejects favoriting the same auction twice", async () => {
    const { favoriteAuction } = commands();
    const bidderId = uuid();
    const auctionId = await createScheduledAuction();
    await favoriteAuction.execute({ bidderId, auctionId });

    // celowo BEZ czekania na widok: regułę "już polubione" trzyma agregat
    // Watchlist, odtwarzany z event store'u — jest natychmiast spójna
    await expect(
      favoriteAuction.execute({ bidderId, auctionId }),
    ).rejects.toThrow(AuctionAlreadyFavoritedError);
  });

  it("favorites are per-bidder (one auction in two watchlists)", async () => {
    const { favoriteAuction, startAuction } = commands();
    const [bidderA, bidderB] = [uuid(), uuid()];
    const auctionId = await createScheduledAuction();

    await favoriteAuction.execute({ bidderId: bidderA, auctionId });
    await favoriteAuction.execute({ bidderId: bidderB, auctionId });
    for (const bidderId of [bidderA, bidderB]) {
      await eventually(
        () => getMyFavorites.execute({ bidderId }),
        (f) => f.length === 1,
      );
    }

    // start aktualizuje JEDEN wiersz katalogu — obaj oferanci widzą zmianę
    // przez join, bez zapisu do favorites_view (koniec z fan-outem)
    await startAuction.execute({ auctionId });
    for (const bidderId of [bidderA, bidderB]) {
      await eventually(
        () => getMyFavorites.execute({ bidderId }),
        (f) => f[0]?.status === "ACTIVE",
      );
    }
  });

  it("hides a favorite whose catalog row has not arrived yet, then shows it", async () => {
    // separate topics, no cross-topic order: the favorite may overtake the
    // catalog (e.g. when views are rebuilt) — nothing enforces it in the DB now
    const auctionId = uuid();
    const bidderId = uuid();
    await publishEnvelope(relay.pulsar, TOPICS.watchlist, {
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
    });
    // sentinel: a later favorite of a catalogued auction — the topic is handled
    // in order, so once it shows up, ours has been projected too
    const sentinelBidder = uuid();
    await commands().favoriteAuction.execute({
      bidderId: sentinelBidder,
      auctionId: await createScheduledAuction(),
    });
    await eventually(
      () => getMyFavorites.execute({ bidderId: sentinelBidder }),
      (f) => f.length === 1,
    );

    expect(await getMyFavorites.execute({ bidderId })).toEqual([]);

    await publishEnvelope(relay.pulsar, TOPICS.auction, {
      streamType: "auction",
      streamId: auctionId,
      version: 1,
      eventType: "AuctionCreated",
      payload: {
        eventType: "AuctionCreated",
        occurredAt: new Date(),
        auctionId,
        sellerId: uuid(),
        title: "Late catalog row",
        status: "SCHEDULED",
        startingPrice: { amount: 100, currency: "USD" },
        startsAt: new Date(Date.now() + DAY),
        endsAt: new Date(Date.now() + 7 * DAY),
      } as EventEnvelope["payload"],
    });
    const favorites = await eventually(
      () => getMyFavorites.execute({ bidderId }),
      (f) => f.length === 1,
    );
    expect(favorites[0]?.title).toBe("Late catalog row");
  });

  it("warns, without failing, when catalog or favorites events find no row", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const auctionId = uuid();
    const bidderId = uuid();

    // a bid for an auction the catalog never saw, and an unfavorite without a favorite
    await publishEnvelope(relay.pulsar, TOPICS.auction, {
      streamType: "auction",
      streamId: auctionId,
      version: 1,
      eventType: "BidPlaced",
      payload: {
        eventType: "BidPlaced",
        occurredAt: new Date(),
        auctionId,
        bidderId,
        amount: { amount: 120, currency: "USD" },
        bidNumber: 1,
      } as EventEnvelope["payload"],
    });
    await publishEnvelope(relay.pulsar, TOPICS.watchlist, {
      streamType: "watchlist",
      streamId: bidderId,
      version: 1,
      eventType: "AuctionUnfavorited",
      payload: {
        eventType: "AuctionUnfavorited",
        occurredAt: new Date(),
        bidderId,
        auctionId,
      } as EventEnvelope["payload"],
    });

    const warned = (text: string) =>
      warn.mock.calls.some(([message]) => String(message).includes(text));
    await eventually(
      async () => warned(`stream ${auctionId}`) && warned(`stream ${bidderId}`),
      (both) => both,
    );
    warn.mockRestore();
  });
});

describe("Favorites — one failing view does not stall the others", () => {
  it("keeps favorites and active auctions updating while the catalog projection fails", async () => {
    // the catalog learns about the auction first, so it can still be favorited
    await startWorker();
    const auctionId = await createScheduledAuction("Rower");
    await stopWorker?.();
    stopWorker = undefined;

    // same consumers as createWorker, except the catalog projection now throws
    const uow = new PrismaUnitOfWork(prisma);
    const ledger = new StreamVersionLedger(uow);
    const broken: IProjection = {
      handle: () => Promise.reject(new Error("catalog projection is broken")),
    };
    const consumer = (
      topic: (typeof TOPICS)[keyof typeof TOPICS],
      subscription:
        | "active-auctions"
        | "watchlist-auction-catalog"
        | "watchlist-favorites",
      projection: IProjection,
    ) =>
      new ProjectionConsumer(relay.pulsar, {
        topic,
        subscription,
        projection: new StreamOrderedProjection(
          subscription,
          projection,
          ledger,
          uow,
        ),
        eventSchema: EVENT_SCHEMAS[topic],
        nackRedeliveryMs: 200,
      });
    const consumers = [
      consumer(
        TOPICS.auction,
        "active-auctions",
        new ActiveAuctionsProjection(uow),
      ),
      consumer(TOPICS.auction, "watchlist-auction-catalog", broken),
      consumer(
        TOPICS.watchlist,
        "watchlist-favorites",
        new FavoritesProjection(uow),
      ),
    ];
    const errors = jest.spyOn(console, "error").mockImplementation(() => {});
    await Promise.all(consumers.map((c) => c.start()));
    stopWorker = async () => {
      await Promise.all(consumers.map((c) => c.stop()));
      errors.mockRestore();
    };

    const { favoriteAuction, createAuction, placeBid } = commands();
    const bidderId = uuid();
    await favoriteAuction.execute({ bidderId, auctionId });
    const activeId = uuid();
    await createAuction.execute({
      auctionId: activeId,
      sellerId: uuid(),
      title: "Laptop",
      startingPrice: { amount: 100, currency: "USD" },
      startsAt: new Date(Date.now() - DAY),
      endsAt: new Date(Date.now() + 7 * DAY),
    });
    await placeBid.execute({
      auctionId: activeId,
      bidderId: uuid(),
      amount: { amount: 140, currency: "USD" },
    });

    await eventually(
      () => getMyFavorites.execute({ bidderId }),
      (f) => f.length === 1 && f[0]?.title === "Rower",
    );
    await eventually(
      async () =>
        (await getActiveAuctions.execute()).find((a) => a.id === activeId),
      (a) => a?.currentBid === 140,
    );
    // …while the broken catalog really did miss it: the injection took effect
    expect(await auctionCatalog.findForFavoriting(activeId)).toEqual({
      exists: false,
    });
  });
});
