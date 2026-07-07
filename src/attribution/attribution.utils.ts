import type {
  AttributableTouchpoint,
  AttributionWeight,
} from './attribution.types';

/** Keep only touchpoints within `windowDays` before the conversion, ordered by time. */
export function applyAttributionWindow(
  touchpoints: AttributableTouchpoint[],
  conversionAt: Date,
  windowDays: number,
): AttributableTouchpoint[] {
  const cutoff = conversionAt.getTime() - windowDays * 24 * 60 * 60 * 1000;
  return touchpoints
    .filter(
      (tp) =>
        tp.occurredAt.getTime() >= cutoff &&
        tp.occurredAt.getTime() <= conversionAt.getTime(),
    )
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
}

/** Normalize raw weights so they sum to exactly 1 (guards against rounding drift). */
export function normalizeWeights(
  raw: Array<{ touchpointId: string; weight: number }>,
): AttributionWeight[] {
  const total = raw.reduce((sum, w) => sum + w.weight, 0);
  if (total <= 0) return [];
  return raw.map((w) => ({
    touchpointId: w.touchpointId,
    weight: w.weight / total,
  }));
}
