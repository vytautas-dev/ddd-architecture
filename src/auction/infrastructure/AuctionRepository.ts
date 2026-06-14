import { Auction } from "../domain/Auction";
import type { AuctionDomainEvent } from "../domain/AuctionEvents";
import type { IAuctionRepository } from "../domain/IAuctionRepository";
import type { IEventStore } from "../../shared/domain/IEventStore";

export class AuctionRepository implements IAuctionRepository {
  constructor(private readonly eventStore: IEventStore) {}

  async save(auction: Auction): Promise<void> {
    const events = auction.getUncommittedEvents();
    if (events.length === 0) return;

    const currentVersion = await this.getCurrentVersion(auction.id);
    await this.eventStore.append("auction", auction.id, events, currentVersion);
  }

  async getById(id: string): Promise<Auction | null> {
    const storedEvents = await this.eventStore.getStream(id);
    if (storedEvents.length === 0) return null;

    // Event store hands back the generic DomainEvent; the Auction context
    // owns the concrete union, so we narrow at this boundary.
    const events = storedEvents.map((e) => e.payload as AuctionDomainEvent);
    return Auction.reconstitute(events);
  }

  private async getCurrentVersion(auctionId: string): Promise<number> {
    const storedEvents = await this.eventStore.getStream(auctionId);
    return storedEvents.length;
  }
}
