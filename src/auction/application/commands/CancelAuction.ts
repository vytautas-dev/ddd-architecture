import { IAuctionRepository } from "../../domain/IAuctionRepository";
import { AuctionNotFoundError } from "../../domain/AuctionErrors";

export interface CancelAuctionCommand {
  auctionId: string;
}

export class CancelAuctionHandler {
  constructor(private readonly auctionRepository: IAuctionRepository) {}

  async execute(command: CancelAuctionCommand): Promise<void> {
    const auction = await this.auctionRepository.getById(command.auctionId);
    if (!auction) {
      throw new AuctionNotFoundError();
    }

    auction.cancel();
    await this.auctionRepository.save(auction);
  }
}
