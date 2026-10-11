import type { IProjection } from "../../domain/IProjection";
import type { PrismaUnitOfWork } from "../PrismaUnitOfWork";
import type { EventEnvelope } from "./EventEnvelope";
import type { StreamVersionLedger } from "./StreamVersionLedger";
import { decideStreamVersion } from "./streamVersionDecision";

export class StreamGapError extends Error {
  constructor(
    readonly projectionName: string,
    readonly streamId: string,
    readonly lastApplied: number,
    readonly incoming: number,
  ) {
    super(
      `${projectionName}: stream ${streamId} is at version ${lastApplied}, got ${incoming} — waiting for ${lastApplied + 1}`,
    );
    this.name = "StreamGapError";
  }
}

export class StreamVersionConflictError extends Error {
  constructor(
    readonly projectionName: string,
    readonly streamId: string,
    readonly version: number,
  ) {
    super(
      `${projectionName}: version ${version} of stream ${streamId} was applied concurrently`,
    );
    this.name = "StreamVersionConflictError";
  }
}

/**
 * Guards a projection so it sees each stream strictly in version order, once:
 * the next version is applied, an old one is skipped, and an early one is
 * refused (StreamGapError) until the missing version has been applied. Order
 * comes from the ledger, not from the broker — a nack can reorder deliveries.
 */
export class StreamOrderedProjection {
  constructor(
    readonly name: string,
    private readonly projection: IProjection,
    private readonly ledger: StreamVersionLedger,
    private readonly uow: PrismaUnitOfWork,
  ) {}

  apply(envelope: EventEnvelope): Promise<"applied" | "duplicate"> {
    const { streamId, version } = envelope;
    return this.uow.run(async () => {
      const last = await this.ledger.lastApplied(this.name, streamId);
      switch (decideStreamVersion(last, version)) {
        case "duplicate":
          return "duplicate";
        case "gap":
          throw new StreamGapError(this.name, streamId, last, version);
        case "apply":
          // events the projection ignores still advance its ledger, or the
          // next version would look like a gap
          await this.projection.handle(envelope.payload, { streamId, version });
          if (
            !(await this.ledger.advance(this.name, streamId, last, version))
          ) {
            throw new StreamVersionConflictError(this.name, streamId, version);
          }
          return "applied";
      }
    });
  }
}
