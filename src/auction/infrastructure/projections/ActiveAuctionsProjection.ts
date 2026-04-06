import type { PrismaClient } from "../../../generated/prisma/client";
import type { AuctionDomainEvent } from "../../domain/AuctionEvents";

export class ActiveAuctionsProjection {
  constructor(private readonly prisma: PrismaClient) {}

  async handle(event: AuctionDomainEvent): Promise<void> {
    switch (event.eventType) {
      case "AuctionCreated":
        await this.prisma.activeAuctionView.create({
          data: {
            id: event.auctionId,
            sellerId: event.sellerId,
            title: event.title,
            currentBid: null,
            currency: event.startingPrice.currency,
            endsAt: event.endsAt,
            totalBids: 0,
          },
        });
        break;
      case "BidPlaced":
        await this.prisma.activeAuctionView.update({
          where: { id: event.auctionId },
          data: {
            currentBid: event.amount.amount,
            totalBids: { increment: 1 },
          },
        });
        break;
      case "AuctionClosed":
      case "AuctionCancelled":
        await this.prisma.activeAuctionView.delete({
          where: { id: event.auctionId },
        });
        break;
    }
  }
}
