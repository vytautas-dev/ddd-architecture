import { IAuctionRepository } from "../../domain/IAuctionRepository";
import { AuctionNotFoundError } from "../../domain/AuctionErrors";
import { Money } from "../../domain/Money";
import { retryOnConcurrencyConflict } from "../../../shared/application/retryOnConcurrencyConflict";

export interface PlaceBidCommand {
  auctionId: string;
  bidderId: string;
  amount: { amount: number; currency: string };
}

export class PlaceBidHandler {
  constructor(private readonly auctionRepository: IAuctionRepository) {}

  async execute(command: PlaceBidCommand): Promise<void> {
    // On a concurrency conflict the whole cycle is retried: the reloaded auction
    // carries the winning bid, so placeBid() re-runs the bid rules against the
    // fresh highest bid — a losing bid is then correctly rejected (BidTooLowError).
    await retryOnConcurrencyConflict(async () => {
      const auction = await this.auctionRepository.getById(command.auctionId);
      if (!auction) {
        throw new AuctionNotFoundError();
      }

      auction.placeBid(
        command.bidderId,
        new Money(command.amount.amount, command.amount.currency),
      );
      await this.auctionRepository.save(auction);
    });
  }
}
