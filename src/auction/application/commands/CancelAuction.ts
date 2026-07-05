import { IAuctionRepository } from "../../domain/IAuctionRepository";
import { AuctionNotFoundError } from "../../domain/AuctionErrors";
import { retryOnConcurrencyConflict } from "../../../shared/application/retryOnConcurrencyConflict";

export interface CancelAuctionCommand {
  auctionId: string;
}

export class CancelAuctionHandler {
  constructor(private readonly auctionRepository: IAuctionRepository) {}

  async execute(command: CancelAuctionCommand): Promise<void> {
    await retryOnConcurrencyConflict(async () => {
      const auction = await this.auctionRepository.getById(command.auctionId);
      if (!auction) {
        throw new AuctionNotFoundError();
      }

      auction.cancel();
      await this.auctionRepository.save(auction);
    });
  }
}
