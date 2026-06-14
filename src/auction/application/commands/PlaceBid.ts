import { IAuctionRepository } from "../../domain/IAuctionRepository";
import { AuctionNotFoundError } from "../../domain/AuctionErrors";
import { Money } from "../../domain/Money";

export interface PlaceBidCommand {
  auctionId: string;
  bidderId: string;
  amount: { amount: number; currency: string };
}

export class PlaceBidHandler {
  constructor(private readonly auctionRepository: IAuctionRepository) {}

  async execute(command: PlaceBidCommand): Promise<void> {
    const auction = await this.auctionRepository.getById(command.auctionId);
    if (!auction) {
      throw new AuctionNotFoundError();
    }

    auction.placeBid(
      command.bidderId,
      new Money(command.amount.amount, command.amount.currency),
    );
    await this.auctionRepository.save(auction);
  }
}
