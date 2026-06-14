import type { Request, Response, NextFunction } from "express";
import {
  AuctionNotFoundError,
  AuctionClosedError,
  SellerCannotBidError,
  BidTooLowError,
  CannotCancelAuctionWithBidsError,
  AuctionNotScheduledError,
  AuctionNotStartedError,
} from "../domain/AuctionErrors";
import { OptimisticConcurrencyError } from "../../shared/infrastructure/EventStore";
import {
  AuctionAlreadyFavoritedError,
  AuctionNotFavoritedError,
} from "../../watchlist/domain/WatchlistErrors";
import { AuctionNotUpcomingError } from "../../watchlist/application/WatchlistApplicationErrors";

type DomainErrorClass = new (...args: never[]) => Error;

const errorStatusMap: ReadonlyArray<[DomainErrorClass, number]> = [
  [AuctionNotFoundError, 404],
  [SellerCannotBidError, 409],
  [AuctionClosedError, 409],
  [BidTooLowError, 409],
  [CannotCancelAuctionWithBidsError, 409],
  [OptimisticConcurrencyError, 409],
  [AuctionNotScheduledError, 409],
  [AuctionNotStartedError, 409],
  [AuctionAlreadyFavoritedError, 409],
  [AuctionNotFavoritedError, 404],
  [AuctionNotUpcomingError, 422],
];

export function domainErrorHandler(
  err: Error,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  const match = errorStatusMap.find(([ErrorType]) => err instanceof ErrorType);
  if (match) {
    res.status(match[1]).json({ error: err.message });
    return;
  }
  next(err);
}
