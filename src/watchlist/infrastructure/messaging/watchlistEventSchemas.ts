import { z } from "zod";
import type { WatchlistDomainEvent } from "../../domain/WatchlistEvents";

// The Watchlist events as they travel through Pulsar (JSON, dates as ISO
// strings), validated at the worker boundary.

const base = {
  occurredAt: z.iso
    .datetime({ offset: true })
    .transform((value) => new Date(value)),
  bidderId: z.string(),
  auctionId: z.string(),
};

export const watchlistEventSchema = z.discriminatedUnion("eventType", [
  z.object({ ...base, eventType: z.literal("AuctionFavorited") }),
  z.object({ ...base, eventType: z.literal("AuctionUnfavorited") }),
]) satisfies z.ZodType<WatchlistDomainEvent, unknown>;
