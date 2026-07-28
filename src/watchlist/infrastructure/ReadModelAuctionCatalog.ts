import type { PrismaUnitOfWork } from "../../shared/infrastructure/PrismaUnitOfWork";
import type {
  AuctionForFavoriting,
  IAuctionCatalog,
} from "../domain/IAuctionCatalog";

/**
 * Anti-Corruption Layer over the Auction context. Reads the Watchlist-owned
 * catalog (built from Auction events) and translates the auction lifecycle
 * into the single question the Watchlist actually asks.
 */
export class ReadModelAuctionCatalog implements IAuctionCatalog {
  constructor(private readonly uow: PrismaUnitOfWork) {}

  async findForFavoriting(auctionId: string): Promise<AuctionForFavoriting> {
    const row = await this.uow.client.watchlistAuctionCatalog.findUnique({
      where: { auctionId },
      select: { status: true },
    });
    if (!row) {
      return { exists: false };
    }
    return { exists: true, isUpcoming: row.status === "SCHEDULED" };
  }
}
