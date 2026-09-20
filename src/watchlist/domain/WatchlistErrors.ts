export class AuctionAlreadyFavoritedError extends Error {
  constructor() {
    super("Auction is already in your favorites");
    this.name = "AuctionAlreadyFavoritedError";
  }
}

export class AuctionNotFavoritedError extends Error {
  constructor() {
    super("Auction is not in your favorites");
    this.name = "AuctionNotFavoritedError";
  }
}

// The auction a bidder tried to favorite does not exist in our catalog.
// Named from the Watchlist context's point of view (its own vocabulary) so the
// domain layer does not depend on the Auction context's error classes.
export class AuctionToFavoriteNotFoundError extends Error {
  constructor() {
    super("Auction not found");
    this.name = "AuctionToFavoriteNotFoundError";
  }
}

// Business rule now lives in the domain (was previously checked in the handler):
// only upcoming (SCHEDULED) auctions can be favorited.
export class AuctionNotUpcomingError extends Error {
  constructor() {
    super("Only upcoming (scheduled) auctions can be added to favorites");
    this.name = "AuctionNotUpcomingError";
  }
}
