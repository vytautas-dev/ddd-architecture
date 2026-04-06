import type { AuctionDomainEvent } from "./AuctionEvents";

export interface StoredEvent {
  id: string;
  streamId: string;
  eventType: string;
  payload: AuctionDomainEvent;
  version: number;
  occurredAt: Date;
}

export interface IEventStore {
  append(
    streamId: string,
    events: AuctionDomainEvent[],
    expectedVersion: number,
  ): Promise<void>;

  getStream(streamId: string): Promise<StoredEvent[]>;
}
