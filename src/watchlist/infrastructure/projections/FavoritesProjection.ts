import type { DomainEvent } from "../../../shared/domain/DomainEvent";
import type {
  EventMetadata,
  IProjection,
} from "../../../shared/domain/IProjection";
import { reportMissingRow } from "../../../shared/infrastructure/messaging/reportMissingRow";
import type { PrismaUnitOfWork } from "../../../shared/infrastructure/PrismaUnitOfWork";
import type { WatchlistDomainEvent } from "../../domain/WatchlistEvents";

/**
 * Records which auctions a bidder favorited — nothing more. Auction attributes
 * live in the catalog and are joined at query time, so this projection needs no
 * Auction events and never goes stale.
 */
export class FavoritesProjection implements IProjection {
  constructor(private readonly uow: PrismaUnitOfWork) {}

  async handle(event: DomainEvent, meta: EventMetadata): Promise<void> {
    const e = event as WatchlistDomainEvent;
    switch (e.eventType) {
      case "AuctionFavorited":
        await this.uow.client.favoriteView.upsert({
          where: {
            bidderId_auctionId: {
              bidderId: e.bidderId,
              auctionId: e.auctionId,
            },
          },
          create: {
            bidderId: e.bidderId,
            auctionId: e.auctionId,
            favoritedAt: e.occurredAt,
          },
          update: {},
        });
        break;
      case "AuctionUnfavorited": {
        const { count } = await this.uow.client.favoriteView.deleteMany({
          where: {
            bidderId: e.bidderId,
            auctionId: e.auctionId,
          },
        });
        if (count === 0) {
          reportMissingRow("watchlist-favorites", e.eventType, meta);
        }
        break;
      }
    }
  }
}
