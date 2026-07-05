import type { DomainEvent } from "../../../shared/domain/DomainEvent";
import type { IProjection } from "../../../shared/domain/IProjection";
import type { PrismaUnitOfWork } from "../../../shared/infrastructure/PrismaUnitOfWork";
import type { AuctionDomainEvent } from "../../domain/AuctionEvents";

export class ActiveAuctionsProjection implements IProjection {
  constructor(private readonly uow: PrismaUnitOfWork) {}

  async handle(event: DomainEvent): Promise<void> {
    const e = event as AuctionDomainEvent;
    switch (e.eventType) {
      case "AuctionCreated":
        await this.uow.client.activeAuctionView.create({
          data: {
            id: e.auctionId,
            sellerId: e.sellerId,
            title: e.title,
            status: e.status,
            currentBid: null,
            currency: e.startingPrice.currency,
            startsAt: e.startsAt,
            endsAt: e.endsAt,
            totalBids: 0,
          },
        });
        break;
      case "BidPlaced":
        await this.uow.client.activeAuctionView.update({
          where: { id: e.auctionId },
          data: {
            currentBid: e.amount.amount,
            totalBids: { increment: 1 },
          },
        });
        break;
      case "AuctionStarted":
        await this.uow.client.activeAuctionView.update({
          where: { id: e.auctionId },
          data: { status: "ACTIVE" },
        });
        break;
      case "AuctionClosed":
      case "AuctionCancelled":
        await this.uow.client.activeAuctionView.delete({
          where: { id: e.auctionId },
        });
        break;
    }
  }
}
