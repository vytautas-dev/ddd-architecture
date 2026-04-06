import { Auction } from "../domain/Auction";
import type { IAuctionRepository } from "../domain/IAuctionRepository";
import type { IEventStore } from "../domain/IEventStore";

export class AuctionRepository implements IAuctionRepository {
  constructor(private readonly eventStore: IEventStore) {}

  async save(auction: Auction): Promise<void> {
    const events = auction.getUncommittedEvents();
    if (events.length === 0) return;

    const currentVersion = await this.getCurrentVersion(auction.id);
    await this.eventStore.append(auction.id, events, currentVersion);
  }

  async getById(id: string): Promise<Auction | null> {
    const storedEvents = await this.eventStore.getStream(id);
    if (storedEvents.length === 0) return null;

    const events = storedEvents.map((e) => e.payload);
    return Auction.reconstitute(events);
  }

  private async getCurrentVersion(auctionId: string): Promise<number> {
    const storedEvents = await this.eventStore.getStream(auctionId);
    return storedEvents.length;
  }
}
