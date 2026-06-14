import type { PrismaClient } from "../../generated/prisma/client";
import type { DomainEvent } from "../domain/DomainEvent";
import type { IEventStore, StoredEvent } from "../domain/IEventStore";
import type { IProjection } from "../domain/IProjection";

export class OptimisticConcurrencyError extends Error {
  constructor(streamId: string) {
    super(`Concurrency conflict on stream: ${streamId}`);
    this.name = "OptimisticConcurrencyError";
  }
}

export class EventStore implements IEventStore {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly projections: Record<string, IProjection[]> = {},
  ) {}

  async append(
    streamType: string,
    streamId: string,
    events: DomainEvent[],
    expectedVersion: number,
  ): Promise<void> {
    const records = events.map((event, index) => ({
      streamId,
      streamType,
      eventType: event.eventType,
      payload: event as object,
      version: expectedVersion + index + 1,
      occurredAt: event.occurredAt,
    }));

    try {
      await this.prisma.eventStore.createMany({ data: records });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new OptimisticConcurrencyError(streamId);
      }
      throw error;
    }

    const projections = this.projections[streamType] ?? [];
    for (const event of events) {
      for (const projection of projections) {
        await projection.handle(event);
      }
    }
  }

  async getStream(streamId: string): Promise<StoredEvent[]> {
    const records = await this.prisma.eventStore.findMany({
      where: { streamId },
      orderBy: { version: "asc" },
    });

    return records.map((record) => ({
      id: record.id,
      streamId: record.streamId,
      eventType: record.eventType,
      payload: record.payload as unknown as DomainEvent,
      version: record.version,
      occurredAt: record.occurredAt,
    }));
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    );
  }
}
