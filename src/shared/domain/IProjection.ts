import type { DomainEvent } from "./DomainEvent";

/** Where an event sits: its stream and its version within that stream. */
export interface EventMetadata {
  readonly streamId: string;
  readonly version: number;
}

export interface IProjection {
  handle(event: DomainEvent, meta: EventMetadata): Promise<void>;
}
