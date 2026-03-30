import type { Money } from "./Money";
import {
  AuctionClosedError,
  BidTooLowError,
  CannotCancelAuctionWithBidsError,
  SellerCannotBidError,
} from "./AuctionErrors";

export enum AuctionStatus {
  ACTIVE = "ACTIVE",
  CLOSED = "CLOSED",
  CANCELLED = "CANCELLED",
}

export class Auction {
  public readonly id: string;
  public readonly sellerId: string;
  public readonly title: string;
  public readonly startingPrice: Money;
  public readonly endsAt: Date;

  public currentHighestBid: Money | null;
  public currentHighestBidderId: string | null;
  public status: AuctionStatus;

  constructor(
    id: string,
    sellerId: string,
    title: string,
    startingPrice: Money,
    endsAt: Date,
  ) {
    this.id = id;
    this.sellerId = sellerId;
    this.title = title;
    this.startingPrice = startingPrice;
    this.endsAt = endsAt;

    this.currentHighestBid = null;
    this.currentHighestBidderId = null;
    this.status = AuctionStatus.ACTIVE;
  }

  placeBid(bidderId: string, amount: Money) {
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

    this.currentHighestBid = amount;
    this.currentHighestBidderId = bidderId;
  }

  close() {
    this.status = AuctionStatus.CLOSED;
  }

  cancel() {
    if (this.currentHighestBid !== null) {
      throw new CannotCancelAuctionWithBidsError();
    }
    this.status = AuctionStatus.CANCELLED;
  }
}
