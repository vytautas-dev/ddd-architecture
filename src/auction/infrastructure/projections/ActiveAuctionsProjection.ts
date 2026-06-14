import type { PrismaClient } from "../../../generated/prisma/client";
import type { DomainEvent } from "../../../shared/domain/DomainEvent";
import type { IProjection } from "../../../shared/domain/IProjection";
import type { AuctionDomainEvent } from "../../domain/AuctionEvents";

export class ActiveAuctionsProjection implements IProjection {
  constructor(private readonly prisma: PrismaClient) {}

  async handle(event: DomainEvent): Promise<void> {
    const e = event as AuctionDomainEvent;
    switch (e.eventType) {
      case "AuctionCreated":
        await this.prisma.activeAuctionView.create({
          data: {
            id: e.auctionId,
            sellerId: e.sellerId,
            title: e.title,
            currentBid: null,
            currency: e.startingPrice.currency,
            endsAt: e.endsAt,
            totalBids: 0,
          },
        });
        break;
      case "BidPlaced":
        await this.prisma.activeAuctionView.update({
          where: { id: e.auctionId },
          data: {
            currentBid: e.amount.amount,
            totalBids: { increment: 1 },
          },
        });
        break;
      case "AuctionClosed":
      case "AuctionCancelled":
        await this.prisma.activeAuctionView.delete({
          where: { id: e.auctionId },
        });
        break;
    }
  }
}
