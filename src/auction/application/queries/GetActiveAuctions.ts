import { PrismaClient } from "../../../generated/prisma/internal/class";

interface GetActiveAuctionsQuery {}

interface ActiveAuctionDto {
  id: string;
  title: string;
  currentBid: number | null;
  currency: string;
  endsAt: Date;
  totalBids: number;
}

export class GetActiveAuctionsHandler {
  constructor(private readonly prisma: PrismaClient) {}

  execute(): Promise<ActiveAuctionDto[]> {
    return this.prisma.activeAuctionView.findMany();
  }
}
