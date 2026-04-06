import { Money } from "./Money";
import {
  AuctionClosedError,
  BidTooLowError,
  CannotCancelAuctionWithBidsError,
  SellerCannotBidError,
} from "./AuctionErrors";
import type { AuctionDomainEvent } from "./AuctionEvents";

export enum AuctionStatus {
  ACTIVE = "ACTIVE",
  CLOSED = "CLOSED",
  CANCELLED = "CANCELLED",
}

export class Auction {
  public id!: string;
  public sellerId!: string;
  public title!: string;
  public startingPrice!: Money;
  public endsAt!: Date;
  public currentHighestBid: Money | null = null;
  public currentHighestBidderId: string | null = null;
  public status: AuctionStatus = AuctionStatus.ACTIVE;

  private uncommittedEvents: AuctionDomainEvent[] = [];
  private version: number = 0;

  private constructor() {}

  static create(
    id: string,
    sellerId: string,
    title: string,
    startingPrice: Money,
    endsAt: Date,
  ): Auction {
    const auction = new Auction();
    auction.applyAndRecord({
      eventType: "AuctionCreated",
      auctionId: id,
      sellerId,
      title,
      startingPrice: {
        amount: startingPrice.amount,
        currency: startingPrice.currency,
      },
      endsAt,
      occurredAt: new Date(),
    });
    return auction;
  }

  static reconstitute(events: AuctionDomainEvent[]): Auction {
    const auction = new Auction();
    for (const event of events) {
      auction.apply(event);
    }
    return auction;
  }

  placeBid(bidderId: string, amount: Money): void {
    if (this.status !== AuctionStatus.ACTIVE) {
      throw new AuctionClosedError();
    }
    if (bidderId === this.sellerId) {
      throw new SellerCannotBidError();
    }

    const minimum = this.currentHighestBid ?? this.startingPrice;
    if (!amount.isGreaterThan(minimum)) {
      throw new BidTooLowError();
    }

    this.applyAndRecord({
      eventType: "BidPlaced",
      auctionId: this.id,
      bidderId,
      amount: { amount: amount.amount, currency: amount.currency },
      occurredAt: new Date(),
    });
  }

  close(): void {
    this.applyAndRecord({
      eventType: "AuctionClosed",
      auctionId: this.id,
      winnerId: this.currentHighestBidderId,
      occurredAt: new Date(),
    });
  }

  cancel(): void {
    if (this.currentHighestBid !== null) {
      throw new CannotCancelAuctionWithBidsError();
    }
    this.applyAndRecord({
      eventType: "AuctionCancelled",
      auctionId: this.id,
      occurredAt: new Date(),
    });
  }

  apply(event: AuctionDomainEvent): void {
    switch (event.eventType) {
      case "AuctionCreated":
        this.id = event.auctionId;
        this.sellerId = event.sellerId;
        this.title = event.title;
        this.startingPrice = new Money(
          event.startingPrice.amount,
          event.startingPrice.currency,
        );
        this.endsAt = event.endsAt;
        break;
      case "BidPlaced":
        this.currentHighestBid = new Money(
          event.amount.amount,
          event.amount.currency,
        );
        this.currentHighestBidderId = event.bidderId;
        break;
      case "AuctionClosed":
        this.status = AuctionStatus.CLOSED;
        break;
      case "AuctionCancelled":
        this.status = AuctionStatus.CANCELLED;
        break;
    }
    this.version++;
  }

  getUncommittedEvents(): AuctionDomainEvent[] {
    return [...this.uncommittedEvents];
  }

  private applyAndRecord(event: AuctionDomainEvent): void {
    this.apply(event);
    this.uncommittedEvents.push(event);
  }
}
