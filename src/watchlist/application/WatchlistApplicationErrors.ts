export class AuctionNotUpcomingError extends Error {
  constructor() {
    super("Only upcoming (scheduled) auctions can be added to favorites");
    this.name = "AuctionNotUpcomingError";
  }
}
