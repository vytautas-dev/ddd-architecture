import type { IProjection } from "../../../shared/domain/IProjection";
import type { WatchlistDomainEvent } from "../../domain/WatchlistEvents";
import type { AuctionDomainEvent } from "../../../auction/domain/AuctionEvents";
import type { DomainEvent } from "../../../shared/domain/DomainEvent";
import type { PrismaUnitOfWork } from "../../../shared/infrastructure/PrismaUnitOfWork";

type HandledEvent = AuctionDomainEvent | WatchlistDomainEvent;

export class FavoritesProjection implements IProjection {
  constructor(private readonly uow: PrismaUnitOfWork) {}

  async handle(event: DomainEvent): Promise<void> {
    const e = event as HandledEvent;
    switch (e.eventType) {
      case "AuctionFavorited": {
        const auction = await this.uow.client.activeAuctionView.findUnique({
          where: { id: e.auctionId },
        });
        if (!auction) return;

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
            title: auction.title,
            status: auction.status,
            currentBid: auction.currentBid,
            currency: auction.currency,
            startsAt: auction.startsAt,
            favoritedAt: e.occurredAt,
          },
          update: {},
        });
        break;
      }
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
      case "AuctionStarted":
        await this.uow.client.favoriteView.updateMany({
          where: { auctionId: e.auctionId },
          data: { status: "ACTIVE" },
        });
        break;
      case "BidPlaced":
        await this.uow.client.favoriteView.updateMany({
          where: { auctionId: e.auctionId },
          data: { currentBid: e.amount.amount },
        });
        break;
      case "AuctionClosed":
        await this.uow.client.favoriteView.updateMany({
          where: { auctionId: e.auctionId },
          data: { status: "CLOSED" },
        });
        break;
      case "AuctionCancelled":
        await this.uow.client.favoriteView.updateMany({
          where: { auctionId: e.auctionId },
          data: { status: "CANCELLED" },
        });
        break;
    }
  }
}
