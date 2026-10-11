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
        ...(query.status ? { auction: { status: query.status } } : {}),
      },
      orderBy: [{ auction: { startsAt: "asc" } }, { auctionId: "asc" }],
      include: { auction: true },
    });

    // No foreign key ties a favorite to its catalog row (they are projected from
    // different topics), so a favorite can briefly exist before the auction is
    // catalogued. Leave it out until the catalog catches up.
    return rows
      .filter((r) => r.auction !== null)
      .map((r) => ({
        auctionId: r.auctionId,
        title: r.auction.title,
        startsAt: r.auction.startsAt,
        status: r.auction.status,
        currentBid: r.auction.currentBid,
        currency: r.auction.currency,
      }));
  }
}
