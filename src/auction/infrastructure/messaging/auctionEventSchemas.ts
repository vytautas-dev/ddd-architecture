import { z } from "zod";
import type { AuctionDomainEvent } from "../../domain/AuctionEvents";

// The Auction events as they travel through Pulsar: JSON, so every Date is an
// ISO string on the wire and becomes a Date again here. This is the shape the
// Auction context publishes; consumers (its own projections and the Watchlist
// catalog) validate against it at the worker boundary.

// any ISO 8601 timestamp, with Z or an explicit offset
const isoDate = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value));
const money = z.object({ amount: z.number(), currency: z.string() });
const base = { occurredAt: isoDate, auctionId: z.string() };

export const auctionEventSchema = z.discriminatedUnion("eventType", [
  z.object({
    ...base,
    eventType: z.literal("AuctionCreated"),
    sellerId: z.string(),
    title: z.string(),
    startingPrice: money,
    startsAt: isoDate,
    endsAt: isoDate,
    status: z.enum(["SCHEDULED", "ACTIVE"]),
  }),
  z.object({ ...base, eventType: z.literal("AuctionStarted") }),
  z.object({
    ...base,
    eventType: z.literal("BidPlaced"),
    bidderId: z.string(),
    amount: money,
    bidNumber: z.number().int().positive(),
  }),
  z.object({
    ...base,
    eventType: z.literal("AuctionClosed"),
    winnerId: z.string().nullable(),
  }),
  z.object({ ...base, eventType: z.literal("AuctionCancelled") }),
]) satisfies z.ZodType<AuctionDomainEvent, unknown>;
