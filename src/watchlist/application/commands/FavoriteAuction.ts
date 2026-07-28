import type { CommandHandler } from "../../../shared/application/CommandHandler";
import type { IAuctionCatalog } from "../../domain/IAuctionCatalog";
import type { IWatchlistRepository } from "../../domain/IWatchlistRepository";

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
    const auction = await this.auctionCatalog.findForFavoriting(
      command.auctionId,
    );

    const watchlist = await this.watchlistRepository.getByBidderId(
      command.bidderId,
    );

    watchlist.favorite(command.auctionId, auction);

    await this.watchlistRepository.save(watchlist);
  }
}
