import type { Watchlist } from "./Watchlist";

export interface IWatchlistRepository {
  getByBidderId(bidderId: string): Promise<Watchlist>;
  save(watchlist: Watchlist): Promise<void>;
}
