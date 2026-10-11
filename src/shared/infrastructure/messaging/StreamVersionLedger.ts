import type { PrismaUnitOfWork } from "../PrismaUnitOfWork";

/**
 * Per projection and stream, the last event version applied. Writes go
 * through the read-model unit of work, so a ledger move commits together with
 * the view write it records.
 */
export class StreamVersionLedger {
  constructor(private readonly uow: PrismaUnitOfWork) {}

  /** 0 when the projection has never applied anything from this stream. */
  async lastApplied(projectionName: string, streamId: string): Promise<number> {
    const row = await this.uow.client.projectionStreamVersion.findUnique({
      where: { projectionName_streamId: { projectionName, streamId } },
      select: { version: true },
    });
    return row?.version ?? 0;
  }

  /**
   * Compare-and-set: moves the stream from `from` to `to` only if it is still
   * at `from`. Returns false when a concurrent delivery got there first — the
   * row lock makes the loser wait for the winner's commit, then see the change.
   */
  async advance(
    projectionName: string,
    streamId: string,
    from: number,
    to: number,
  ): Promise<boolean> {
    if (from === 0) {
      const { count } =
        await this.uow.client.projectionStreamVersion.createMany({
          data: { projectionName, streamId, version: to },
          skipDuplicates: true, // a duplicate key must not abort the transaction
        });
      return count === 1;
    }
    const { count } = await this.uow.client.projectionStreamVersion.updateMany({
      where: { projectionName, streamId, version: from },
      data: { version: to },
    });
    return count === 1;
  }
}
