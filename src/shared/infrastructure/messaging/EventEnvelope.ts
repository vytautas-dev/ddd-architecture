import type { DomainEvent } from "../../domain/DomainEvent";

/**
 * What travels through the outbox and Pulsar for each stored event: the event
 * plus where it sits in its stream. `version` is what lets a consumer tell a
 * duplicate from a gap.
 */
export interface EventEnvelope {
  readonly streamType: string;
  readonly streamId: string;
  readonly version: number;
  readonly eventType: string;
  readonly payload: DomainEvent;
}

/** Deterministic and unique per event: one stream never reuses a version. */
export function envelopeMessageId(envelope: EventEnvelope): string {
  return `${envelope.streamId}:${envelope.version}`;
}
