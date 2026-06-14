import { Watchlist } from "../Watchlist";
import {
  AuctionAlreadyFavoritedError,
  AuctionNotFavoritedError,
} from "../WatchlistErrors";
import type { WatchlistDomainEvent } from "../WatchlistEvents";

const BIDDER = "bidder-1";
const emptyWatchlist = () => Watchlist.reconstitute(BIDDER, []);

describe("Watchlist", () => {
  describe("favorite", () => {
    it("records an AuctionFavorited event on an empty watchlist", () => {
      const watchlist = emptyWatchlist();
      watchlist.favorite("auction-1");

      const events = watchlist.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe("AuctionFavorited");
      expect(watchlist.isFavorited("auction-1")).toBe(true);
    });

    it("throws AuctionAlreadyFavoritedError when already favorited", () => {
      const watchlist = emptyWatchlist();
      watchlist.favorite("auction-1");
      expect(() => watchlist.favorite("auction-1")).toThrow(
        AuctionAlreadyFavoritedError,
      );
    });
  });

  describe("unfavorite", () => {
    it("records an AuctionUnfavorited event and removes the auction", () => {
      const watchlist = emptyWatchlist();
      watchlist.favorite("auction-1");
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
