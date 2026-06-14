import { Watchlist } from "../domain/Watchlist";
import type { WatchlistDomainEvent } from "../domain/WatchlistEvents";
import type { IWatchlistRepository } from "../domain/IWatchlistRepository";
import type { IEventStore } from "../../shared/domain/IEventStore";

export class WatchlistRepository implements IWatchlistRepository {
  constructor(private readonly eventStore: IEventStore) {}

  async save(watchlist: Watchlist): Promise<void> {
    const events = watchlist.getUncommittedEvents();
    if (events.length === 0) return;

    const currentVersion = await this.getCurrentVersion(watchlist.bidderId);
    await this.eventStore.append(
      "watchlist",
      watchlist.bidderId,
      events,
      currentVersion,
    );
  }

  async getByBidderId(bidderId: string): Promise<Watchlist> {
    const storedEvents = await this.eventStore.getStream(bidderId);

    const events = storedEvents.map((e) => e.payload as WatchlistDomainEvent);
    return Watchlist.reconstitute(bidderId, events);
  }

  private async getCurrentVersion(bidderId: string): Promise<number> {
    const storedEvents = await this.eventStore.getStream(bidderId);
    return storedEvents.length;
  }
}
