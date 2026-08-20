import type { DomainEvent } from "../domain/DomainEvent";
import type { IProjection } from "../domain/IProjection";
import type { PrismaUnitOfWork } from "./PrismaUnitOfWork";

export class CatchUpSubscription {
  constructor(
    private readonly uow: PrismaUnitOfWork,
    private readonly projections: Record<string, IProjection[]>,
    private readonly subscriberName: string,
    private readonly batchSize: number = 100,
  ) {}

  async runOnce(): Promise<number> {
    const records = await this.readBatch();

    for (const record of records) {
      await this.uow.run(async () => {
        await this.dispatch(
          record.streamType,
          record.payload as unknown as DomainEvent,
        );
        await this.saveCheckpoint(record.position);
      });
    }

    return records.length;
  }

  private async readBatch() {
    const checkpoint = await this.uow.client.projectionCheckpoint.findUnique({
      where: { subscriberName: this.subscriberName },
    });

    return this.uow.client.eventStore.findMany({
      where: { position: { gt: checkpoint?.position ?? BigInt(0) } },
      orderBy: { position: "asc" },
      take: this.batchSize,
    });
  }

  private async dispatch(
    streamType: string,
    event: DomainEvent,
  ): Promise<void> {
    for (const projection of this.projections[streamType] ?? []) {
      await projection.handle(event);
    }
  }

  private async saveCheckpoint(position: bigint): Promise<void> {
    await this.uow.client.projectionCheckpoint.upsert({
      where: { subscriberName: this.subscriberName },
      create: { subscriberName: this.subscriberName, position },
      update: { position },
    });
  }
}
