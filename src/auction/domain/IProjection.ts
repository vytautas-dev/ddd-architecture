import type { AuctionDomainEvent } from "./AuctionEvents";

export interface IProjection {
  handle(event: AuctionDomainEvent): Promise<void>;
}
