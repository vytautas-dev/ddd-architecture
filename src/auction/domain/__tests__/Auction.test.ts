import { Auction, AuctionStatus } from "../Auction";
import { Money } from "../Money";
import {
  AuctionClosedError,
  AuctionNotScheduledError,
  AuctionNotStartedError,
  BidTooLowError,
  CannotCancelAuctionWithBidsError,
  SellerCannotBidError,
} from "../AuctionErrors";

const HOUR = 3600000;

const makeAuction = (overrides?: Partial<{ endsAt: Date; startsAt: Date }>) =>
  Auction.create(
    "auction-1",
    "seller-1",
    "Vintage Camera",
    new Money(100, "PLN"),
    overrides?.endsAt ?? new Date(Date.now() + 24 * HOUR),
    // default: already started in the past → ACTIVE
    overrides?.startsAt ?? new Date(Date.now() - HOUR),
  );

const makeScheduledAuction = () =>
  makeAuction({ startsAt: new Date(Date.now() + HOUR) });

describe("Auction", () => {
  describe("constructor", () => {
    it("creates an active auction with no bids", () => {
      const auction = makeAuction();
      expect(auction.status).toBe(AuctionStatus.ACTIVE);
      expect(auction.currentHighestBid).toBeNull();
      expect(auction.currentHighestBidderId).toBeNull();
    });
  });

  describe("lifecycle (scheduled / start)", () => {
    it("creates a SCHEDULED auction when startsAt is in the future", () => {
      const auction = makeScheduledAuction();
      expect(auction.status).toBe(AuctionStatus.SCHEDULED);
    });

    it("creates an ACTIVE auction when startsAt is in the past", () => {
      const auction = makeAuction({ startsAt: new Date(Date.now() - HOUR) });
      expect(auction.status).toBe(AuctionStatus.ACTIVE);
    });

    it("start() transitions a scheduled auction to ACTIVE", () => {
      const auction = makeScheduledAuction();
      auction.start();
      expect(auction.status).toBe(AuctionStatus.ACTIVE);
    });

    it("start() records an AuctionStarted event", () => {
      const auction = makeScheduledAuction();
      auction.start();
      const events = auction.getUncommittedEvents();
      expect(events).toHaveLength(2);
      expect(events[1].eventType).toBe("AuctionStarted");
    });

    it("throws AuctionNotScheduledError when starting an active auction", () => {
      const auction = makeAuction();
      expect(() => auction.start()).toThrow(AuctionNotScheduledError);
    });

    it("throws AuctionNotScheduledError when starting a closed auction", () => {
      const auction = makeScheduledAuction();
      auction.start();
      auction.close();
      expect(() => auction.start()).toThrow(AuctionNotScheduledError);
    });

    it("reconstitutes to ACTIVE from [AuctionCreated(SCHEDULED), AuctionStarted]", () => {
      const original = makeScheduledAuction();
      original.start();
      const reconstituted = Auction.reconstitute(
        original.getUncommittedEvents(),
      );
      expect(reconstituted.status).toBe(AuctionStatus.ACTIVE);
    });
  });

  describe("placeBid", () => {
    it("accepts a bid higher than starting price", () => {
      const auction = makeAuction();
      auction.placeBid("bidder-1", new Money(150, "PLN"));
      expect(auction.currentHighestBid?.amount).toBe(150);
      expect(auction.currentHighestBidderId).toBe("bidder-1");
    });

    it("accepts a bid higher than current highest bid", () => {
      const auction = makeAuction();
      auction.placeBid("bidder-1", new Money(150, "PLN"));
      auction.placeBid("bidder-2", new Money(200, "PLN"));
      expect(auction.currentHighestBid?.amount).toBe(200);
      expect(auction.currentHighestBidderId).toBe("bidder-2");
    });

    it("throws BidTooLowError when bid equals starting price", () => {
      const auction = makeAuction();
      expect(() => auction.placeBid("bidder-1", new Money(100, "PLN"))).toThrow(
        BidTooLowError,
      );
    });

    it("throws BidTooLowError when bid is lower than current highest", () => {
      const auction = makeAuction();
      auction.placeBid("bidder-1", new Money(150, "PLN"));
      expect(() => auction.placeBid("bidder-2", new Money(120, "PLN"))).toThrow(
        BidTooLowError,
      );
    });

    it("throws SellerCannotBidError when seller tries to bid", () => {
      const auction = makeAuction();
      expect(() => auction.placeBid("seller-1", new Money(150, "PLN"))).toThrow(
        SellerCannotBidError,
      );
    });

    it("throws AuctionClosedError when auction is closed", () => {
      const auction = makeAuction();
      auction.close();
      expect(() => auction.placeBid("bidder-1", new Money(150, "PLN"))).toThrow(
        AuctionClosedError,
      );
    });

    it("throws AuctionNotStartedError when auction is scheduled", () => {
      const auction = makeScheduledAuction();
      expect(() => auction.placeBid("bidder-1", new Money(150, "PLN"))).toThrow(
        AuctionNotStartedError,
      );
    });

    it("throws AuctionClosedError when auction is cancelled", () => {
      const auction = makeAuction();
      auction.cancel();
      expect(() => auction.placeBid("bidder-1", new Money(150, "PLN"))).toThrow(
        AuctionClosedError,
      );
    });
  });

  describe("close", () => {
    it("sets status to CLOSED", () => {
      const auction = makeAuction();
      auction.close();
      expect(auction.status).toBe(AuctionStatus.CLOSED);
    });
  });

  describe("event sourcing", () => {
    it("records AuctionCreated event on create", () => {
      const auction = makeAuction();
      const events = auction.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe("AuctionCreated");
    });

    it("records BidPlaced event on placeBid", () => {
      const auction = makeAuction();
      auction.placeBid("bidder-1", new Money(150, "PLN"));
      const events = auction.getUncommittedEvents();
      expect(events).toHaveLength(2);
      expect(events[1].eventType).toBe("BidPlaced");
    });

    it("reconstitutes auction state from events", () => {
      const original = makeAuction();
      original.placeBid("bidder-1", new Money(150, "PLN"));
      original.placeBid("bidder-2", new Money(200, "PLN"));

      const reconstituted = Auction.reconstitute(
        original.getUncommittedEvents(),
      );

      expect(reconstituted.id).toBe(original.id);
      expect(reconstituted.currentHighestBid?.amount).toBe(200);
      expect(reconstituted.currentHighestBidderId).toBe("bidder-2");
      expect(reconstituted.status).toBe(AuctionStatus.ACTIVE);
    });

    it("reconstituted auction has no uncommitted events", () => {
      const original = makeAuction();
      const reconstituted = Auction.reconstitute(
        original.getUncommittedEvents(),
      );
      expect(reconstituted.getUncommittedEvents()).toHaveLength(0);
    });
  });

  describe("cancel", () => {
    it("sets status to CANCELLED when no bids", () => {
      const auction = makeAuction();
      auction.cancel();
      expect(auction.status).toBe(AuctionStatus.CANCELLED);
    });

    it("throws CannotCancelAuctionWithBidsError when bids exist", () => {
      const auction = makeAuction();
      auction.placeBid("bidder-1", new Money(150, "PLN"));
      expect(() => auction.cancel()).toThrow(CannotCancelAuctionWithBidsError);
    });
  });
});
