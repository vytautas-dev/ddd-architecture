import { DomainEvent } from "../../shared/domain/DomainEvent";

export interface AuctionFavoritedEvent extends DomainEvent {
  readonly eventType: "AuctionFavorited";
  readonly bidderId: string;
  readonly auctionId: string;
}

export interface AuctionUnfavoritedEvent extends DomainEvent {
  readonly eventType: "AuctionUnfavorited";
  readonly bidderId: string;
  readonly auctionId: string;
}

export type WatchlistDomainEvent =
  | AuctionFavoritedEvent
  | AuctionUnfavoritedEvent;
