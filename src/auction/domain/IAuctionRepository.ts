import type { Auction } from "./Auction";

export interface IAuctionRepository {
  save(auction: Auction): Promise<void>;
  getById(id: string): Promise<Auction | null>;
}
