import type { IWatchlistRepository } from "../../domain/IWatchlistRepository";
import type { CommandHandler } from "../../../shared/application/CommandHandler";

export interface UnfavoriteAuctionCommand {
  bidderId: string;
  auctionId: string;
}

export class UnfavoriteAuctionHandler
  implements CommandHandler<UnfavoriteAuctionCommand>
{
  constructor(private readonly watchlistRepository: IWatchlistRepository) {}

  async execute(command: UnfavoriteAuctionCommand): Promise<void> {
    const watchlist = await this.watchlistRepository.getByBidderId(
      command.bidderId,
    );

    watchlist.unfavorite(command.auctionId);
    await this.watchlistRepository.save(watchlist);
  }
}
