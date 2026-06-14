import type { DomainEvent } from "./DomainEvent";

export interface StoredEvent {
  id: string;
  streamId: string;
  eventType: string;
  payload: DomainEvent;
  version: number;
  occurredAt: Date;
}

export interface IEventStore {
  append(
    streamType: string,
    streamId: string,
    events: DomainEvent[],
    expectedVersion: number,
  ): Promise<void>;

  getStream(streamId: string): Promise<StoredEvent[]>;
}