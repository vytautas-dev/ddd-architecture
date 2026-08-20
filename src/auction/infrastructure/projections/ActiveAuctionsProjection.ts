import type { DomainEvent } from "../../../shared/domain/DomainEvent";
import type { IProjection } from "../../../shared/domain/IProjection";
import type { PrismaUnitOfWork } from "../../../shared/infrastructure/PrismaUnitOfWork";
import type { AuctionDomainEvent } from "../../domain/AuctionEvents";

export class ActiveAuctionsProjection implements IProjection {
  constructor(private readonly uow: PrismaUnitOfWork) {}

  async handle(event: DomainEvent): Promise<void> {
    const e = event as AuctionDomainEvent;
    switch (e.eventType) {
      case "AuctionCreated": {
        const row = {
          sellerId: e.sellerId,
          title: e.title,
          status: e.status,
          currentBid: null,
          currency: e.startingPrice.currency,
          startsAt: e.startsAt,
          endsAt: e.endsAt,
          totalBids: 0,
        };

        await this.uow.client.activeAuctionView.upsert({
          where: { id: e.auctionId },
          create: { id: e.auctionId, ...row },
          update: row,
        });
        break;
      }
      case "BidPlaced":
        await this.uow.client.activeAuctionView.updateMany({
          where: { id: e.auctionId },
          data: { currentBid: e.amount.amount, totalBids: e.bidNumber },
        });
        break;
      case "AuctionStarted":
        await this.uow.client.activeAuctionView.updateMany({
          where: { id: e.auctionId },
          data: { status: "ACTIVE" },
        });
        break;
      case "AuctionClosed":
      case "AuctionCancelled":
        await this.uow.client.activeAuctionView.deleteMany({
          where: { id: e.auctionId },
        });
        break;
    }
  }
}
