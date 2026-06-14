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
