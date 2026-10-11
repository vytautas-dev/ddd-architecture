import type { AuctionDomainEvent } from "../../../auction/domain/AuctionEvents";
import type { DomainEvent } from "../../../shared/domain/DomainEvent";
import type {
  EventMetadata,
  IProjection,
} from "../../../shared/domain/IProjection";
import { reportMissingRow } from "../../../shared/infrastructure/messaging/reportMissingRow";
import type { PrismaUnitOfWork } from "../../../shared/infrastructure/PrismaUnitOfWork";

export class AuctionCatalogProjection implements IProjection {
  constructor(private readonly uow: PrismaUnitOfWork) {}

  async handle(event: DomainEvent, meta: EventMetadata): Promise<void> {
    const e = event as AuctionDomainEvent;
    if ((await this.apply(e)) === 0) {
      reportMissingRow("watchlist-auction-catalog", e.eventType, meta);
    }
  }

  /** Rows updated; undefined when the event inserts or is ignored. */
  private async apply(e: AuctionDomainEvent): Promise<number | undefined> {
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
        return undefined;
      }
      case "AuctionStarted":
        return this.update(e.auctionId, { status: "ACTIVE" });
      case "BidPlaced":
        return this.update(e.auctionId, { currentBid: e.amount.amount });
      // the catalog keeps finished auctions: "not upcoming" ≠ "not found"
      case "AuctionClosed":
        return this.update(e.auctionId, { status: "CLOSED" });
      case "AuctionCancelled":
        return this.update(e.auctionId, { status: "CANCELLED" });
    }
  }

  private async update(
    auctionId: string,
    data: { status?: "ACTIVE" | "CLOSED" | "CANCELLED"; currentBid?: number },
  ): Promise<number> {
    const { count } = await this.uow.client.watchlistAuctionCatalog.updateMany({
      where: { auctionId },
      data,
    });
    return count;
  }
}
