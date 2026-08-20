import "dotenv/config";
import { randomUUID as uuid } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { CancelAuctionHandler } from "../../auction/application/commands/CancelAuction";
import { CreateAuctionHandler } from "../../auction/application/commands/CreateAuction";
import { StartAuctionHandler } from "../../auction/application/commands/StartAuction";
import { AuctionRepository } from "../../auction/infrastructure/AuctionRepository";
import { ActiveAuctionsProjection } from "../../auction/infrastructure/projections/ActiveAuctionsProjection";
import { PrismaClient } from "../../generated/prisma/client";
import { withBehaviors } from "../../shared/application/withBehaviors";
import { CatchUpSubscription } from "../../shared/infrastructure/CatchUpSubscription";
import { EventStore } from "../../shared/infrastructure/EventStore";
import { PrismaUnitOfWork } from "../../shared/infrastructure/PrismaUnitOfWork";
import { FavoriteAuctionHandler } from "../application/commands/FavoriteAuction";
import { UnfavoriteAuctionHandler } from "../application/commands/UnfavoriteAuction";
import { GetMyFavoritesHandler } from "../application/queries/GetMyFavorites";
import {
  AuctionAlreadyFavoritedError,
  AuctionNotUpcomingError,
  AuctionToFavoriteNotFoundError,
} from "../domain/WatchlistErrors";
import { AuctionCatalogProjection } from "../infrastructure/projections/AuctionCatalogProjection";
import { FavoritesProjection } from "../infrastructure/projections/FavoritesProjection";
import { ReadModelAuctionCatalog } from "../infrastructure/ReadModelAuctionCatalog";
import { WatchlistRepository } from "../infrastructure/WatchlistRepository";

const DAY = 24 * 60 * 60 * 1000;

// Buduje ten sam graf obiektów co index.ts (bez serwera HTTP) — łącznie
// z behaviorami, żeby scenariusze przechodziły przez ścieżkę transakcyjną.
const adapter = new PrismaPg({ connectionString: process.env["DATABASE_URL"] });
const prisma = new PrismaClient({ adapter });
const uow = new PrismaUnitOfWork(prisma);

const eventStore = new EventStore(uow);
const readModels = new CatchUpSubscription(
  uow,
  {
    auction: [
      new ActiveAuctionsProjection(uow),
      new AuctionCatalogProjection(uow),
    ],
    watchlist: [new FavoritesProjection(uow)],
  },
  "read-models",
);
const auctionRepository = new AuctionRepository(eventStore);
const watchlistRepository = new WatchlistRepository(eventStore);
const auctionCatalog = new ReadModelAuctionCatalog(uow);

const createAuction = withBehaviors(
  new CreateAuctionHandler(auctionRepository),
  {
    transaction: uow,
  },
);
const startAuction = withBehaviors(new StartAuctionHandler(auctionRepository), {
  retry: true,
  transaction: uow,
});
const cancelAuction = withBehaviors(
  new CancelAuctionHandler(auctionRepository),
  {
    retry: true,
    transaction: uow,
  },
);
const favoriteAuction = withBehaviors(
  new FavoriteAuctionHandler(watchlistRepository, auctionCatalog),
  { retry: true, transaction: uow },
);
const unfavoriteAuction = withBehaviors(
  new UnfavoriteAuctionHandler(watchlistRepository),
  { retry: true, transaction: uow },
);
const getMyFavorites = new GetMyFavoritesHandler(prisma);

// Projekcje nie działają już w transakcji komendy — dogania je subskrypcja.
// Test nie śpi i nie zgaduje: przewija log do końca i dopiero wtedy czyta.
async function project(): Promise<void> {
  while ((await readModels.runOnce()) > 0) {
    // przetwarzaj kolejne batche, aż log się skończy
  }
}

async function createScheduledAuction(
  title = "Vintage chair",
): Promise<string> {
  const auctionId = uuid();
  await createAuction.execute({
    auctionId,
    sellerId: uuid(),
    title,
    startingPrice: { amount: 100, currency: "USD" },
    endsAt: new Date(Date.now() + 7 * DAY),
    startsAt: new Date(Date.now() + DAY), // przyszłość → SCHEDULED
  });
  // fixture obiecuje aukcję widoczną w katalogu, nie samo zdarzenie w logu
  await project();
  return auctionId;
}

beforeEach(async () => {
  // checkpoint to stan tego testu tak samo jak widoki — bez tego subskrypcja
  // pamiętałaby pozycję z poprzedniego scenariusza
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "event_store", "active_auctions_view", "favorites_view", "watchlist_auction_catalog_view", "projection_checkpoints"',
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Favorites — integration (path through handlers + DB)", () => {
  it("full lifecycle: create(SCHEDULED) → favorite → start → filter → unfavorite", async () => {
    const bidderId = uuid();
    const auctionId = await createScheduledAuction();

    // polubienie nadchodzącej aukcji
    await favoriteAuction.execute({ bidderId, auctionId });
    await project();

    const favorites = await getMyFavorites.execute({ bidderId });
    expect(favorites).toHaveLength(1);
    expect(favorites[0]?.auctionId).toBe(auctionId);
    expect(favorites[0]?.status).toBe("SCHEDULED");
    expect(favorites[0]?.title).toBe("Vintage chair");

    // start aukcji — favorites_view nie jest ruszany, nowy status przychodzi
    // z katalogu przez join przy odczycie
    await startAuction.execute({ auctionId });
    await project();

    expect(
      await getMyFavorites.execute({ bidderId, status: "SCHEDULED" }),
    ).toHaveLength(0);
    const active = await getMyFavorites.execute({ bidderId, status: "ACTIVE" });
    expect(active).toHaveLength(1);
    expect(active[0]?.status).toBe("ACTIVE");

    // odlubienie
    await unfavoriteAuction.execute({ bidderId, auctionId });
    await project();
    expect(await getMyFavorites.execute({ bidderId })).toHaveLength(0);
  });

  it("rejects favoriting an auction that is not upcoming (already ACTIVE)", async () => {
    const bidderId = uuid();
    const auctionId = await createScheduledAuction();
    await startAuction.execute({ auctionId }); // → ACTIVE
    // bez tego katalog wciąż mówi SCHEDULED i polubienie by przeszło —
    // reguła domenowa czyta model eventually consistent
    await project();

    await expect(
      favoriteAuction.execute({ bidderId, auctionId }),
    ).rejects.toThrow(AuctionNotUpcomingError);
  });

  // Regression: the catalog keeps cancelled auctions (unlike active_auctions_view,
  // which deletes the row) so a cancelled auction is reported as "not upcoming"
  // rather than "not found".
  it("rejects favoriting a cancelled auction as not-upcoming, not as missing", async () => {
    const bidderId = uuid();
    const auctionId = await createScheduledAuction();
    await cancelAuction.execute({ auctionId });
    await project();

    await expect(
      favoriteAuction.execute({ bidderId, auctionId }),
    ).rejects.toThrow(AuctionNotUpcomingError);
  });

  it("rejects favoriting a non-existent auction", async () => {
    await expect(
      favoriteAuction.execute({ bidderId: uuid(), auctionId: uuid() }),
    ).rejects.toThrow(AuctionToFavoriteNotFoundError);
  });

  it("rejects favoriting the same auction twice", async () => {
    const bidderId = uuid();
    const auctionId = await createScheduledAuction();
    await favoriteAuction.execute({ bidderId, auctionId });

    // celowo BEZ project(): regułę "już polubione" trzyma agregat Watchlist,
    // odtwarzany z event store'u — jest natychmiast spójna, nie eventually
    await expect(
      favoriteAuction.execute({ bidderId, auctionId }),
    ).rejects.toThrow(AuctionAlreadyFavoritedError);
  });

  it("favorites are per-bidder (one auction in two watchlists)", async () => {
    const bidderA = uuid();
    const bidderB = uuid();
    const auctionId = await createScheduledAuction();

    await favoriteAuction.execute({ bidderId: bidderA, auctionId });
    await favoriteAuction.execute({ bidderId: bidderB, auctionId });
    await project();

    expect(await getMyFavorites.execute({ bidderId: bidderA })).toHaveLength(1);
    expect(await getMyFavorites.execute({ bidderId: bidderB })).toHaveLength(1);

    // start aktualizuje JEDEN wiersz katalogu — obaj oferanci widzą zmianę
    // przez join, bez zapisu do favorites_view (koniec z fan-outem)
    await startAuction.execute({ auctionId });
    await project();
    expect(
      (await getMyFavorites.execute({ bidderId: bidderA }))[0]?.status,
    ).toBe("ACTIVE");
    expect(
      (await getMyFavorites.execute({ bidderId: bidderB }))[0]?.status,
    ).toBe("ACTIVE");
  });
});
