import type { IWatchlistRepository } from "../../domain/IWatchlistRepository";
import { retryOnConcurrencyConflict } from "../../../shared/application/retryOnConcurrencyConflict";

export interface UnfavoriteAuctionCommand {
  bidderId: string;
  auctionId: string;
}

export class UnfavoriteAuctionHandler {
  constructor(private readonly watchlistRepository: IWatchlistRepository) {}

  async execute(command: UnfavoriteAuctionCommand): Promise<void> {
    await retryOnConcurrencyConflict(async () => {
      const watchlist = await this.watchlistRepository.getByBidderId(
        command.bidderId,
      );

      watchlist.unfavorite(command.auctionId);
      await this.watchlistRepository.save(watchlist);
    });
  }
}
