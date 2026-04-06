import { IAuctionRepository } from "../../domain/IAuctionRepository";
import { Auction } from "../../domain/Auction";
import { Money } from "../../domain/Money";

export interface CreateAuctionCommand {
  auctionId: string;
  sellerId: string;
  title: string;
  startingPrice: { amount: number; currency: string };
  endsAt: Date;
}

export class CreateAuctionHandler {
  constructor(private readonly auctionRepository: IAuctionRepository) {}

  async execute(command: CreateAuctionCommand): Promise<void> {
    const auction = Auction.create(
      command.auctionId,
      command.sellerId,
      command.title,
      new Money(command.startingPrice.amount, command.startingPrice.currency),
      command.endsAt,
    );

    await this.auctionRepository.save(auction);
  }
}
