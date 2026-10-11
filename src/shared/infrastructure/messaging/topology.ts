/**
 * Where events travel. One topic per aggregate type: every event of one
 * aggregate lands on one topic under one key (its streamId), which is what
 * makes per-aggregate order possible downstream (ADR-0001).
 */
export const TOPICS = {
  auction: "persistent://public/default/auction-events",
  watchlist: "persistent://public/default/watchlist-events",
} as const;

/** One subscription — one independent cursor — per projection. */
export const PROJECTION_SUBSCRIPTIONS = [
  { topic: TOPICS.auction, subscription: "active-auctions" },
  { topic: TOPICS.auction, subscription: "watchlist-auction-catalog" },
  { topic: TOPICS.watchlist, subscription: "watchlist-favorites" },
] as const;

export class UnknownStreamTypeError extends Error {
  constructor(readonly streamType: string) {
    super(`No topic for stream type "${streamType}"`);
    this.name = "UnknownStreamTypeError";
  }
}

export function topicFor(streamType: string): string {
  if (streamType in TOPICS) {
    return TOPICS[streamType as keyof typeof TOPICS];
  }
  throw new UnknownStreamTypeError(streamType);
}
