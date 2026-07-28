import type { DomainEvent } from "../../../shared/domain/DomainEvent";
import type { IProjection } from "../../../shared/domain/IProjection";
import type { PrismaUnitOfWork } from "../../../shared/infrastructure/PrismaUnitOfWork";
import type { WatchlistDomainEvent } from "../../domain/WatchlistEvents";

/**
 * Records which auctions a bidder favorited — nothing more. Auction attributes
 * live in the catalog and are joined at query time, so this projection needs no
 * Auction events and never goes stale.
 */
export class FavoritesProjection implements IProjection {
  constructor(private readonly uow: PrismaUnitOfWork) {}

  async handle(event: DomainEvent): Promise<void> {
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
      case "AuctionUnfavorited":
        await this.uow.client.favoriteView.delete({
          where: {
            bidderId_auctionId: {
              bidderId: e.bidderId,
              auctionId: e.auctionId,
            },
          },
        });
        break;
    }
  }
}
