import type { DomainEvent } from "../../shared/domain/DomainEvent";
import type { MoneyAttributes } from "./Money";

export interface AuctionCreatedEvent extends DomainEvent {
  readonly eventType: "AuctionCreated";
  readonly auctionId: string;
  readonly sellerId: string;
  readonly title: string;
  readonly startingPrice: MoneyAttributes;
  readonly endsAt: Date;
  readonly startsAt: Date;
  readonly status: "SCHEDULED" | "ACTIVE";
}

export interface AuctionStartedEvent extends DomainEvent {
  readonly eventType: "AuctionStarted";
  readonly auctionId: string;
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
  | AuctionStartedEvent
  | BidPlacedEvent
  | AuctionClosedEvent
  | AuctionCancelledEvent;
