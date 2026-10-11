import type { JSONValue, TransactionSql } from "postgres";
import type { DomainEvent } from "../../domain/DomainEvent";
import type { IEventStore, StoredEvent } from "../../domain/IEventStore";
import type { PostgresUnitOfWork } from "../PostgresUnitOfWork";
import { type EventEnvelope, envelopeMessageId } from "./EventEnvelope";

/** The slice of the Hermes outbox this store needs. */
export interface Outbox {
  queue(
    messages: { messageId: string; messageType: string; message: JSONValue }[],
    options: { tx: TransactionSql },
  ): Promise<void>;
}

export class OutboxRequiresTransactionError extends Error {
  constructor() {
    super(
      "OutboxEventStore.append must run inside a unit of work — the events and their outbox entries have to commit together",
    );
    this.name = "OutboxRequiresTransactionError";
  }
}

/**
 * Decorator over an IEventStore (same idea as withBehaviors over handlers):
 * appends the events, then queues one envelope per event into the outbox in
 * the same transaction. Either both commit or neither does, so an event can
 * never be stored without being published, nor published without being
 * stored (the dual-write problem).
 */
export class OutboxEventStore implements IEventStore {
  constructor(
    private readonly inner: IEventStore,
    private readonly uow: PostgresUnitOfWork,
    private readonly outbox: Outbox,
  ) {}

  async append(
    streamType: string,
    streamId: string,
    events: DomainEvent[],
    expectedVersion: number,
  ): Promise<void> {
    const tx = this.uow.transaction;
    if (!tx) {
      // without a transaction Hermes would commit the outbox row on its own
      throw new OutboxRequiresTransactionError();
    }

    await this.inner.append(streamType, streamId, events, expectedVersion);

    const envelopes: EventEnvelope[] = events.map((event, index) => ({
      streamType,
      streamId,
      version: expectedVersion + index + 1,
      eventType: event.eventType,
      payload: event,
    }));
    await this.outbox.queue(
      envelopes.map((envelope) => ({
        messageId: envelopeMessageId(envelope),
        messageType: envelope.eventType,
        // serialized as JSON, so Date fields travel as ISO strings
        message: envelope as unknown as JSONValue,
      })),
      { tx },
    );
  }

  getStream(streamId: string): Promise<StoredEvent[]> {
    return this.inner.getStream(streamId);
  }
}
