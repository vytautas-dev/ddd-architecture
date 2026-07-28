import type { AuctionDomainEvent } from "../../../auction/domain/AuctionEvents";
import type { DomainEvent } from "../../../shared/domain/DomainEvent";
import type { IProjection } from "../../../shared/domain/IProjection";
import type { PrismaUnitOfWork } from "../../../shared/infrastructure/PrismaUnitOfWork";

export class AuctionCatalogProjection implements IProjection {
  constructor(private readonly uow: PrismaUnitOfWork) {}

  async handle(event: DomainEvent): Promise<void> {
    const e = event as AuctionDomainEvent;
    switch (e.eventType) {
      case "AuctionCreated":
        await this.uow.client.watchlistAuctionCatalog.create({
          data: {
            auctionId: e.auctionId,
            title: e.title,
            status: e.status,
            currentBid: null,
            currency: e.startingPrice.currency,
            startsAt: e.startsAt,
          },
        });
        break;
      case "AuctionStarted":
        await this.uow.client.watchlistAuctionCatalog.update({
          where: { auctionId: e.auctionId },
          data: { status: "ACTIVE" },
        });
        break;
      case "BidPlaced":
        await this.uow.client.watchlistAuctionCatalog.update({
          where: { auctionId: e.auctionId },
          data: { currentBid: e.amount.amount },
        });
        break;
      case "AuctionClosed":
        await this.uow.client.watchlistAuctionCatalog.update({
          where: { auctionId: e.auctionId },
          data: { status: "CLOSED" },
        });
        break;
      case "AuctionCancelled":
        await this.uow.client.watchlistAuctionCatalog.update({
          where: { auctionId: e.auctionId },
          data: { status: "CANCELLED" },
        });
        break;
    }
  }
}
