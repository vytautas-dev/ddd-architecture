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

export type Topic = (typeof TOPICS)[keyof typeof TOPICS];

export type ProjectionSubscriptionName =
  (typeof PROJECTION_SUBSCRIPTIONS)[number]["subscription"];

export const PROJECTION_SUBSCRIPTION_NAMES: readonly ProjectionSubscriptionName[] =
  PROJECTION_SUBSCRIPTIONS.map((s) => s.subscription);

/**
 * Where a subscription's poison messages go after their last redelivery. One
 * dead-letter topic per subscription, so a replay only reaches the projection
 * that failed (plus duplicates the others ignore).
 */
export function deadLetterTopicFor(
  topic: string,
  subscription: ProjectionSubscriptionName,
): string {
  return `${topic}-${subscription}-DLQ`;
}

/**
 * Created on every dead-letter topic together with it, so Pulsar retains the
 * dead letters until `dlq:replay` drains them through this subscription.
 */
export const DEAD_LETTER_SUBSCRIPTION = "replay";

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
