import { Watchlist } from "../Watchlist";
import {
  AuctionAlreadyFavoritedError,
  AuctionNotFavoritedError,
  AuctionNotUpcomingError,
  AuctionToFavoriteNotFoundError,
} from "../WatchlistErrors";
import type { AuctionSnapshot } from "../IAuctionCatalog";
import type { WatchlistDomainEvent } from "../WatchlistEvents";

const BIDDER = "bidder-1";
const emptyWatchlist = () => Watchlist.reconstitute(BIDDER, []);

// Snapshot of an upcoming auction — the happy-path input for favorite().
const scheduled: AuctionSnapshot = { exists: true, status: "SCHEDULED" };

describe("Watchlist", () => {
  describe("favorite", () => {
    it("records an AuctionFavorited event on an empty watchlist", () => {
      const watchlist = emptyWatchlist();
      watchlist.favorite("auction-1", scheduled);

      const events = watchlist.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe("AuctionFavorited");
      expect(watchlist.isFavorited("auction-1")).toBe(true);
    });

    it("throws AuctionAlreadyFavoritedError when already favorited", () => {
      const watchlist = emptyWatchlist();
      watchlist.favorite("auction-1", scheduled);
      expect(() => watchlist.favorite("auction-1", scheduled)).toThrow(
        AuctionAlreadyFavoritedError,
      );
    });

    it("throws AuctionToFavoriteNotFoundError when the auction does not exist", () => {
      const watchlist = emptyWatchlist();
      expect(() =>
        watchlist.favorite("auction-1", { exists: false }),
      ).toThrow(AuctionToFavoriteNotFoundError);
      expect(watchlist.getUncommittedEvents()).toHaveLength(0);
    });

    it("throws AuctionNotUpcomingError when the auction is not SCHEDULED", () => {
      const watchlist = emptyWatchlist();
      expect(() =>
        watchlist.favorite("auction-1", { exists: true, status: "ACTIVE" }),
      ).toThrow(AuctionNotUpcomingError);
      expect(watchlist.getUncommittedEvents()).toHaveLength(0);
    });
  });

  describe("unfavorite", () => {
    it("records an AuctionUnfavorited event and removes the auction", () => {
      const watchlist = emptyWatchlist();
      watchlist.favorite("auction-1", scheduled);
      watchlist.unfavorite("auction-1");

      expect(watchlist.isFavorited("auction-1")).toBe(false);
      const events = watchlist.getUncommittedEvents();
      expect(events[1].eventType).toBe("AuctionUnfavorited");
    });

    it("throws AuctionNotFavoritedError when not favorited", () => {
      const watchlist = emptyWatchlist();
      expect(() => watchlist.unfavorite("auction-1")).toThrow(
        AuctionNotFavoritedError,
      );
    });
  });

  describe("reconstitute", () => {
    it("rebuilds state from event history without new uncommitted events", () => {
      const history: WatchlistDomainEvent[] = [
        {
          eventType: "AuctionFavorited",
          bidderId: BIDDER,
          auctionId: "A",
          occurredAt: new Date(),
        },
        {
          eventType: "AuctionFavorited",
          bidderId: BIDDER,
          auctionId: "B",
          occurredAt: new Date(),
        },
        {
          eventType: "AuctionUnfavorited",
          bidderId: BIDDER,
          auctionId: "A",
          occurredAt: new Date(),
        },
      ];
      const watchlist = Watchlist.reconstitute(BIDDER, history);

      expect(watchlist.isFavorited("A")).toBe(false);
      expect(watchlist.isFavorited("B")).toBe(true);
      expect(watchlist.getUncommittedEvents()).toHaveLength(0);
    });
  });
});
