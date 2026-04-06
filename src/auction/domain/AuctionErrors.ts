export class AuctionClosedError extends Error {
  constructor() {
    super("Cannot place a bid on a closed or cancelled auction");
    this.name = "AuctionClosedError";
  }
}

export class SellerCannotBidError extends Error {
  constructor() {
    super("Cannot bid on your own auction");
    this.name = "SellerCannotBidError";
  }
}

export class BidTooLowError extends Error {
  constructor() {
    super("Bid must be higher than the current highest bid");
    this.name = "BidTooLowError";
  }
}

export class CannotCancelAuctionWithBidsError extends Error {
  constructor() {
    super("Cannot cancel an auction that has received bids");
    this.name = "CannotCancelAuctionWithBidsError";
  }
}

export class AuctionNotFoundError extends Error {
  constructor() {
    super("Auction not found");
    this.name = "AuctionNotFoundError";
  }
}
