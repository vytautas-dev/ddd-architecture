import { IAuctionRepository } from "../../domain/IAuctionRepository";
import { AuctionNotFoundError } from "../../domain/AuctionErrors";

export interface StartAuctionCommand {
  auctionId: string;
}

export class StartAuctionHandler {
  constructor(private readonly auctionRepository: IAuctionRepository) {}

  async execute(command: StartAuctionCommand): Promise<void> {
    const auction = await this.auctionRepository.getById(command.auctionId);
    if (!auction) {
      throw new AuctionNotFoundError();
    }

    auction.start();
    await this.auctionRepository.save(auction);
  }
}
