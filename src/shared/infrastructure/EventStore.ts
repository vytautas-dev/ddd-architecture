import { randomUUID } from "node:crypto";
import type { JSONValue } from "postgres";
import type { DomainEvent } from "../domain/DomainEvent";
import type { IEventStore, StoredEvent } from "../domain/IEventStore";
import { OptimisticConcurrencyError } from "../domain/OptimisticConcurrencyError";
import type { PostgresUnitOfWork } from "./PostgresUnitOfWork";

interface EventRow {
  id: string;
  streamId: string;
  eventType: string;
  payload: DomainEvent;
  version: number;
  occurredAt: Date;
}

export class EventStore implements IEventStore {
  constructor(private readonly uow: PostgresUnitOfWork) {}

  async append(
    streamType: string,
    streamId: string,
    events: DomainEvent[],
    expectedVersion: number,
  ): Promise<void> {
    const sql = this.uow.client;
    // `id` has no database default — Prisma generated it client-side.
    const records = events.map((event, index) => ({
      id: randomUUID(),
      streamId,
      streamType,
      eventType: event.eventType,
      // `sql.json` stringifies the event, so Date fields land as ISO strings —
      // the same JSON Prisma wrote.
      payload: sql.json(event as unknown as JSONValue),
      version: expectedVersion + index + 1,
      occurredAt: event.occurredAt,
    }));

    try {
      await sql`INSERT INTO "event_store" ${sql(records)}`;
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new OptimisticConcurrencyError(streamId);
      }
      throw error;
    }
  }

  async getStream(streamId: string): Promise<StoredEvent[]> {
    const sql = this.uow.client;
    return sql<EventRow[]>`
      SELECT "id", "streamId", "eventType", "payload", "version", "occurredAt"
      FROM "event_store"
      WHERE "streamId" = ${streamId}
      ORDER BY "version" ASC
    `;
  }

  /** Postgres `unique_violation` — the `(streamId, version)` constraint. */
  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    );
  }
}
