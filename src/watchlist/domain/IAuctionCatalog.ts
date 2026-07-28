/**
 * What the Watchlist needs to know about an auction to decide whether it can
 * be favorited. Deliberately not a mirror of the Auction lifecycle — the
 * catalog translates Auction's vocabulary into ours, so the aggregate never
 * learns what "SCHEDULED" means.
 */
export type AuctionForFavoriting =
  | { exists: false }
  | { exists: true; isUpcoming: boolean };

export interface IAuctionCatalog {
  findForFavoriting(auctionId: string): Promise<AuctionForFavoriting>;
}
