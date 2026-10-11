import type { EventMetadata } from "../../domain/IProjection";

/**
 * Called when a projection's update or delete matched no row. Events arrive
 * in stream order, so this is an anomaly worth seeing — but not worth failing
 * on: a view is a cache, not the source of truth.
 */
export function reportMissingRow(
  projection: string,
  eventType: string,
  meta: EventMetadata,
): void {
  console.warn(
    `[${projection}] ${eventType} v${meta.version} of stream ${meta.streamId}: no matching row`,
  );
}
