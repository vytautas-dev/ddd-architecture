import type { AuctionDomainEvent } from "../../../auction/domain/AuctionEvents";
import type { DomainEvent } from "../../../shared/domain/DomainEvent";
import type { IProjection } from "../../../shared/domain/IProjection";
import type { PrismaUnitOfWork } from "../../../shared/infrastructure/PrismaUnitOfWork";

export class AuctionCatalogProjection implements IProjection {
  constructor(private readonly uow: PrismaUnitOfWork) {}

  async handle(event: DomainEvent): Promise<void> {
    const e = event as AuctionDomainEvent;
    switch (e.eventType) {
      case "AuctionCreated": {
        const row = {
          title: e.title,
          status: e.status,
          currentBid: null,
          currency: e.startingPrice.currency,
          startsAt: e.startsAt,
        };
        await this.uow.client.watchlistAuctionCatalog.upsert({
          where: { auctionId: e.auctionId },
          create: { auctionId: e.auctionId, ...row },
          update: row,
        });
        break;
      }
      case "AuctionStarted":
        await this.uow.client.watchlistAuctionCatalog.updateMany({
          where: { auctionId: e.auctionId },
          data: { status: "ACTIVE" },
        });
        break;
      case "BidPlaced":
        await this.uow.client.watchlistAuctionCatalog.updateMany({
          where: { auctionId: e.auctionId },
          data: { currentBid: e.amount.amount },
        });
        break;
      case "AuctionClosed":
        await this.uow.client.watchlistAuctionCatalog.updateMany({
          where: { auctionId: e.auctionId },
          data: { status: "CLOSED" },
        });
        break;
      case "AuctionCancelled":
        await this.uow.client.watchlistAuctionCatalog.updateMany({
          where: { auctionId: e.auctionId },
          data: { status: "CANCELLED" },
        });
        break;
    }
  }
}
