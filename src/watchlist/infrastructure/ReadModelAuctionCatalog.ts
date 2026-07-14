import type {
  AuctionSnapshot,
  IAuctionCatalog,
} from "../domain/IAuctionCatalog";
import type { PrismaUnitOfWork } from "../../shared/infrastructure/PrismaUnitOfWork";

type AuctionStatus = Extract<AuctionSnapshot, { exists: true }>["status"];

export class ReadModelAuctionCatalog implements IAuctionCatalog {
  constructor(private readonly uow: PrismaUnitOfWork) {}

  async getSnapshot(auctionId: string): Promise<AuctionSnapshot> {
    const row = await this.uow.client.activeAuctionView.findUnique({
      where: { id: auctionId },
    });
    if (!row) {
      return { exists: false };
    }
    return {
      exists: true,
      status: row.status as AuctionStatus,
    };
  }
}
