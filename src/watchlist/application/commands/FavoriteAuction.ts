import type { IWatchlistRepository } from "../../domain/IWatchlistRepository";
import type { IAuctionCatalog } from "../../domain/IAuctionCatalog";
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
    private readonly auctionCatalog: IAuctionCatalog,
  ) {}

  async execute(command: FavoriteAuctionCommand): Promise<void> {
    const auction = await this.auctionCatalog.getSnapshot(command.auctionId);

    const watchlist = await this.watchlistRepository.getByBidderId(
      command.bidderId,
    );

    watchlist.favorite(command.auctionId, auction);

    await this.watchlistRepository.save(watchlist);
  }
}
