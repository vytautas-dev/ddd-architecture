export type StreamVersionDecision = "apply" | "duplicate" | "gap";

/**
 * What a projection does with version `incoming` of a stream, given the last
 * version it applied. Stream versions are contiguous (1, 2, 3, …), so anything
 * other than the next one is either already seen or arrived too early.
 */
export function decideStreamVersion(
  lastApplied: number,
  incoming: number,
): StreamVersionDecision {
  if (incoming <= lastApplied) return "duplicate";
  if (incoming === lastApplied + 1) return "apply";
  return "gap";
}
