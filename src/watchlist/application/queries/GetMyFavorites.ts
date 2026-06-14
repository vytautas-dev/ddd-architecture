import type { PrismaClient } from "../../../generated/prisma/client";

export interface GetMyFavoritesQuery {
  bidderId: string;
  status?: string;
}

export interface FavoriteDto {
  auctionId: string;
  title: string;
  startsAt: Date;
  status: string;
  currentBid: number | null;
  currency: string;
}

export class GetMyFavoritesHandler {
  constructor(private readonly prisma: PrismaClient) {}

  async execute(query: GetMyFavoritesQuery): Promise<FavoriteDto[]> {
    const rows = await this.prisma.favoriteView.findMany({
      where: {
        bidderId: query.bidderId,
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: [{ startsAt: "asc" }, { auctionId: "asc" }],
    });

    return rows.map((r) => ({
      auctionId: r.auctionId,
      title: r.title,
      startsAt: r.startsAt,
      status: r.status,
      currentBid: r.currentBid,
      currency: r.currency,
    }));
  }
}
