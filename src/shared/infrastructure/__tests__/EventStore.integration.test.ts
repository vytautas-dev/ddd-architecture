import "dotenv/config";
import { randomUUID as uuid } from "node:crypto";
import type { DomainEvent } from "../../domain/DomainEvent";
import { OptimisticConcurrencyError } from "../../domain/OptimisticConcurrencyError";
import { EventStore } from "../EventStore";
import { PostgresUnitOfWork } from "../PostgresUnitOfWork";
import { createPostgresClient } from "../postgresClient";

// The IEventStore contract, against a real database. Streams get fresh ids,
// so tests need no TRUNCATE and cannot see each other's events.
const sql = createPostgresClient(process.env["DATABASE_URL"]);
const uow = new PostgresUnitOfWork(sql);
const eventStore = new EventStore(uow);

interface NoteTaken extends DomainEvent {
  readonly eventType: "NoteTaken";
  readonly note: string;
}

function noteTaken(note: string): NoteTaken {
  return {
    eventType: "NoteTaken",
    occurredAt: new Date("2026-10-11T10:00:00.000Z"),
    note,
  };
}

afterAll(async () => {
  await sql.end();
});

describe("EventStore (Postgres.js)", () => {
  it("returns appended events in version order, numbered from expectedVersion + 1", async () => {
    const streamId = uuid();

    await uow.run(() =>
      eventStore.append("test", streamId, [noteTaken("a"), noteTaken("b")], 0),
    );
    await uow.run(() =>
      eventStore.append("test", streamId, [noteTaken("c")], 2),
    );

    const stream = await eventStore.getStream(streamId);

    expect(stream.map((e) => e.version)).toEqual([1, 2, 3]);
    expect(stream.map((e) => (e.payload as NoteTaken).note)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(stream[0]).toMatchObject({
      streamId,
      eventType: "NoteTaken",
      occurredAt: new Date("2026-10-11T10:00:00.000Z"),
    });
  });

  it("rejects an append with a stale expectedVersion as OptimisticConcurrencyError", async () => {
    const streamId = uuid();
    await uow.run(() =>
      eventStore.append("test", streamId, [noteTaken("first")], 0),
    );

    await expect(
      uow.run(() =>
        eventStore.append("test", streamId, [noteTaken("stale")], 0),
      ),
    ).rejects.toBeInstanceOf(OptimisticConcurrencyError);

    const stream = await eventStore.getStream(streamId);
    expect(stream.map((e) => (e.payload as NoteTaken).note)).toEqual(["first"]);
  });

  it("leaves nothing behind when the surrounding unit of work rolls back", async () => {
    const streamId = uuid();

    await expect(
      uow.run(async () => {
        await eventStore.append("test", streamId, [noteTaken("doomed")], 0);
        throw new Error("command failed after append");
      }),
    ).rejects.toThrow("command failed after append");

    expect(await eventStore.getStream(streamId)).toEqual([]);
  });

  it("returns an empty stream for an unknown streamId", async () => {
    expect(await eventStore.getStream(uuid())).toEqual([]);
  });
});
