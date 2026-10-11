import type { PrismaClient } from "../../../generated/prisma/client";
import {
  PROJECTION_STREAM_TYPES,
  type ProjectionSubscriptionName,
} from "./topology";

type StreamVersion = { streamId: string; version: number };

export interface Lag {
  streamId: string;
  /** last version the projection applied (0 = never seen the stream) */
  applied: number;
  /** last version in the event store */
  head: number;
  gap: number;
}

export interface LaggingStream extends Lag {
  /** how long the first unapplied event has been in the event store */
  waitingMs: number;
  /** waiting at least the threshold: most likely in the DLQ, or no worker runs */
  frozen: boolean;
}

export interface ProjectionStatus {
  projection: ProjectionSubscriptionName;
  lagging: LaggingStream[];
}

/**
 * Compares, per projection, the stream version ledger with the event store
 * and lists the streams the projection is behind on. Read-only.
 *
 * It sees lag, frozen streams and lost events — anything that leaves the
 * ledger short of the event store. It cannot see a projection that applied an
 * event and wrote a wrong value: the ledger moved on, so the stream looks
 * caught up.
 */
export async function readProjectionsStatus(
  prisma: PrismaClient,
  { frozenAfterMs, now = new Date() }: { frozenAfterMs: number; now?: Date },
): Promise<ProjectionStatus[]> {
  const statuses: ProjectionStatus[] = [];
  for (const { streamType, subscription } of PROJECTION_STREAM_TYPES) {
    const heads = await prisma.eventStore.groupBy({
      by: ["streamId"],
      where: { streamType },
      _max: { version: true },
    });
    const applied = await prisma.projectionStreamVersion.findMany({
      where: { projectionName: subscription },
      select: { streamId: true, version: true },
    });
    const lagging = laggingStreams(
      heads.map((h) => ({
        streamId: h.streamId,
        version: h._max.version ?? 0,
      })),
      applied,
    );
    statuses.push({
      projection: subscription,
      lagging: markFrozen(
        lagging,
        await waitingSince(prisma, lagging),
        now,
        frozenAfterMs,
      ),
    });
  }
  return statuses;
}

/** Streams whose ledger version is short of the event store's head. */
export function laggingStreams(
  heads: readonly StreamVersion[],
  applied: readonly StreamVersion[],
): Lag[] {
  const ledger = new Map(applied.map((s) => [s.streamId, s.version]));
  return heads.flatMap(({ streamId, version: head }) => {
    const last = ledger.get(streamId) ?? 0;
    return last < head
      ? [{ streamId, applied: last, head, gap: head - last }]
      : [];
  });
}

/** Adds how long each stream has waited, and whether that makes it frozen. */
export function markFrozen(
  lagging: readonly Lag[],
  waitingSince: ReadonlyMap<string, Date>,
  now: Date,
  frozenAfterMs: number,
): LaggingStream[] {
  return lagging.map((stream) => {
    const since = waitingSince.get(stream.streamId);
    const waitingMs = since ? now.getTime() - since.getTime() : 0;
    return { ...stream, waitingMs, frozen: waitingMs >= frozenAfterMs };
  });
}

/** When the first event each stream is waiting on was recorded. */
async function waitingSince(
  prisma: PrismaClient,
  lagging: readonly Lag[],
): Promise<Map<string, Date>> {
  if (lagging.length === 0) return new Map();
  const events = await prisma.eventStore.findMany({
    where: {
      OR: lagging.map((s) => ({
        streamId: s.streamId,
        version: s.applied + 1,
      })),
    },
    select: { streamId: true, occurredAt: true },
  });
  return new Map(events.map((e) => [e.streamId, e.occurredAt]));
}
