import type { DomainEvent } from "../../../shared/domain/DomainEvent";
import type {
  EventMetadata,
  IProjection,
} from "../../../shared/domain/IProjection";
import { reportMissingRow } from "../../../shared/infrastructure/messaging/reportMissingRow";
import type { PrismaUnitOfWork } from "../../../shared/infrastructure/PrismaUnitOfWork";
import type { AuctionDomainEvent } from "../../domain/AuctionEvents";

export class ActiveAuctionsProjection implements IProjection {
  constructor(private readonly uow: PrismaUnitOfWork) {}

  async handle(event: DomainEvent, meta: EventMetadata): Promise<void> {
    const e = event as AuctionDomainEvent;
    if ((await this.apply(e)) === 0) {
      reportMissingRow("active-auctions", e.eventType, meta);
    }
  }

  /** Rows updated or deleted; undefined when the event inserts or is ignored. */
  private async apply(e: AuctionDomainEvent): Promise<number | undefined> {
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
        return undefined;
      }
      case "BidPlaced": {
        const { count } = await this.uow.client.activeAuctionView.updateMany({
          where: { id: e.auctionId },
          data: { currentBid: e.amount.amount, totalBids: e.bidNumber },
        });
        return count;
      }
      case "AuctionStarted": {
        const { count } = await this.uow.client.activeAuctionView.updateMany({
          where: { id: e.auctionId },
          data: { status: "ACTIVE" },
        });
        return count;
      }
      case "AuctionClosed":
      case "AuctionCancelled": {
        const { count } = await this.uow.client.activeAuctionView.deleteMany({
          where: { id: e.auctionId },
        });
        return count;
      }
    }
  }
}
