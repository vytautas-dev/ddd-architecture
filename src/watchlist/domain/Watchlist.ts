import {
  AuctionAlreadyFavoritedError,
  AuctionNotFavoritedError,
} from "./WatchlistErrors";
import type { WatchlistDomainEvent } from "./WatchlistEvents";

export class Watchlist {
  public bidderId!: string;

  private favoritedAuctionIds: Set<string> = new Set();
  private uncommittedEvents: WatchlistDomainEvent[] = [];
  private persistedVersion: number = 0;

  private constructor() {}

  static reconstitute(
    bidderId: string,
    events: WatchlistDomainEvent[],
  ): Watchlist {
    const watchlist = new Watchlist();
    watchlist.bidderId = bidderId;
    for (const event of events) {
      watchlist.apply(event);
    }
    watchlist.persistedVersion = events.length;
    return watchlist;
  }

  get version(): number {
    return this.persistedVersion;
  }

  favorite(auctionId: string): void {
    if (this.favoritedAuctionIds.has(auctionId)) {
      throw new AuctionAlreadyFavoritedError();
    }

    this.applyAndRecord({
      eventType: "AuctionFavorited",
      bidderId: this.bidderId,
      auctionId,
      occurredAt: new Date(),
    });
  }

  unfavorite(auctionId: string): void {
    if (!this.favoritedAuctionIds.has(auctionId)) {
      throw new AuctionNotFavoritedError();
    }
    this.applyAndRecord({
      eventType: "AuctionUnfavorited",
      bidderId: this.bidderId,
      auctionId,
      occurredAt: new Date(),
    });
  }

  isFavorited(auctionId: string): boolean {
    return this.favoritedAuctionIds.has(auctionId);
  }

  apply(event: WatchlistDomainEvent): void {
    switch (event.eventType) {
      case "AuctionFavorited":
        this.favoritedAuctionIds.add(event.auctionId);
        break;
      case "AuctionUnfavorited":
        this.favoritedAuctionIds.delete(event.auctionId);
        break;
    }
  }

  getUncommittedEvents(): WatchlistDomainEvent[] {
    return [...this.uncommittedEvents];
  }

  private applyAndRecord(event: WatchlistDomainEvent): void {
    this.apply(event);
    this.uncommittedEvents.push(event);
  }
}
