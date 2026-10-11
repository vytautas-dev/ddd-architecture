import type { DomainEvent } from "../../../shared/domain/DomainEvent";
import type {
  EventMetadata,
  IProjection,
} from "../../../shared/domain/IProjection";
import type { PrismaUnitOfWork } from "../../../shared/infrastructure/PrismaUnitOfWork";
import type { AuctionDomainEvent } from "../../domain/AuctionEvents";

export class ActiveAuctionsProjection implements IProjection {
  constructor(private readonly uow: PrismaUnitOfWork) {}

  async handle(event: DomainEvent, meta: EventMetadata): Promise<void> {
    const e = event as AuctionDomainEvent;
    const affectedRows = await this.apply(e);

    // Events now arrive in stream order, so a missing row is an anomaly worth
    // seeing — but not worth failing on: the view is a cache, not the truth.
    if (affectedRows === 0) {
      console.warn(
        `[active-auctions] ${e.eventType} v${meta.version} of stream ${meta.streamId}: no row in active_auctions_view`,
      );
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
