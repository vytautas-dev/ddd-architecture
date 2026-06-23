import { Auction } from "../domain/Auction";
import type { AuctionDomainEvent } from "../domain/AuctionEvents";
import type { IAuctionRepository } from "../domain/IAuctionRepository";
import type { IEventStore } from "../../shared/domain/IEventStore";

export class AuctionRepository implements IAuctionRepository {
  constructor(private readonly eventStore: IEventStore) {}

  async save(auction: Auction): Promise<void> {
    const events = auction.getUncommittedEvents();
    if (events.length === 0) return;

    await this.eventStore.append(
      "auction",
      auction.id,
      events,
      auction.version,
    );
  }

  async getById(id: string): Promise<Auction | null> {
    const storedEvents = await this.eventStore.getStream(id);
    if (storedEvents.length === 0) return null;

    const events = storedEvents.map((e) => e.payload as AuctionDomainEvent);
    return Auction.reconstitute(events);
  }
}
