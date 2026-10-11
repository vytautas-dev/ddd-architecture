import { z } from "zod";
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

/** A message from the broker that is not a well-formed envelope of a known event. */
export class MalformedEnvelopeError extends Error {
  constructor(reason: string) {
    super(`Malformed event envelope: ${reason}`);
    this.name = "MalformedEnvelopeError";
  }
}

const envelopeShape = z.object({
  streamType: z.string(),
  streamId: z.string().min(1),
  version: z.number().int().positive(),
  eventType: z.string(),
  payload: z.unknown(),
});

/**
 * Turns broker bytes into a typed envelope — the worker's system boundary.
 * The payload is validated against the producing context's schema, which also
 * turns ISO date strings back into Dates. Anything else (not JSON, missing or
 * mistyped fields, an event type the schema does not know) is rejected with
 * MalformedEnvelopeError, so the message ends up in the dead-letter topic
 * instead of reaching a projection.
 */
export function parseEnvelope(
  data: Buffer,
  payloadSchema: z.ZodType<DomainEvent, unknown>,
): EventEnvelope {
  let json: unknown;
  try {
    json = JSON.parse(data.toString());
  } catch {
    throw new MalformedEnvelopeError("not JSON");
  }

  const envelope = envelopeShape.safeParse(json);
  if (!envelope.success) {
    throw new MalformedEnvelopeError(z.prettifyError(envelope.error));
  }
  const payload = payloadSchema.safeParse(envelope.data.payload);
  if (!payload.success) {
    throw new MalformedEnvelopeError(z.prettifyError(payload.error));
  }
  if (payload.data.eventType !== envelope.data.eventType) {
    throw new MalformedEnvelopeError(
      `envelope says ${envelope.data.eventType}, payload says ${payload.data.eventType}`,
    );
  }
  return { ...envelope.data, payload: payload.data };
}
