import type { MoneyAttributes } from "./Money";

export interface DomainEvent {
  readonly eventType: string;
  readonly occurredAt: Date;
}

export interface AuctionCreatedEvent extends DomainEvent {
  readonly eventType: "AuctionCreated";
  readonly auctionId: string;
  readonly sellerId: string;
  readonly title: string;
  readonly startingPrice: MoneyAttributes;
  readonly endsAt: Date;
}

export interface BidPlacedEvent extends DomainEvent {
  readonly eventType: "BidPlaced";
  readonly auctionId: string;
  readonly bidderId: string;
  readonly amount: MoneyAttributes;
}

export interface AuctionClosedEvent extends DomainEvent {
  readonly eventType: "AuctionClosed";
  readonly auctionId: string;
  readonly winnerId: string | null;
}

export interface AuctionCancelledEvent extends DomainEvent {
  readonly eventType: "AuctionCancelled";
  readonly auctionId: string;
}

export type AuctionDomainEvent =
  | AuctionCreatedEvent
  | BidPlacedEvent
  | AuctionClosedEvent
  | AuctionCancelledEvent;
