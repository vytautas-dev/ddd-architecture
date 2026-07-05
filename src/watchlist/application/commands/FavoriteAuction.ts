import type { PrismaClient } from "../../../generated/prisma/client";
import type { IWatchlistRepository } from "../../domain/IWatchlistRepository";
import { AuctionNotFoundError } from "../../../auction/domain/AuctionErrors";
import { AuctionNotUpcomingError } from "../WatchlistApplicationErrors";
import type { CommandHandler } from "../../../shared/application/CommandHandler";

export interface FavoriteAuctionCommand {
  bidderId: string;
  auctionId: string;
}

export class FavoriteAuctionHandler
  implements CommandHandler<FavoriteAuctionCommand>
{
  constructor(
    private readonly watchlistRepository: IWatchlistRepository,
    private readonly prisma: PrismaClient,
  ) {}

  async execute(command: FavoriteAuctionCommand): Promise<void> {
    const auction = await this.prisma.activeAuctionView.findUnique({
      where: { id: command.auctionId },
    });
    if (!auction) {
      throw new AuctionNotFoundError();
    }
    if (auction.status !== "SCHEDULED") {
      throw new AuctionNotUpcomingError();
    }

    const watchlist = await this.watchlistRepository.getByBidderId(
      command.bidderId,
    );

    watchlist.favorite(command.auctionId);

    await this.watchlistRepository.save(watchlist);
  }
}
