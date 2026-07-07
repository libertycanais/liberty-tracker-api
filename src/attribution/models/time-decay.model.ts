import type {
  AttributableConversion,
  AttributableTouchpoint,
  AttributionConfig,
  AttributionModel,
  AttributionWeight,
} from '../attribution.types';
import { applyAttributionWindow, normalizeWeights } from '../attribution.utils';

/**
 * Exponential time decay: touches closer to the conversion get more credit.
 * Half-life comes from config (default 7 days) — weight = 2^(-age/halfLife).
 */
export const timeDecayModel: AttributionModel = {
  name: 'time-decay',
  supports: () => true,
  calculate(
    touchpoints: AttributableTouchpoint[],
    conversion: AttributableConversion,
    config: AttributionConfig,
  ): AttributionWeight[] {
    const inWindow = applyAttributionWindow(
      touchpoints,
      conversion.occurredAt,
      config.windowDays,
    );
    if (inWindow.length === 0) return [];

    const halfLifeMs = config.timeDecayHalfLifeDays * 24 * 60 * 60 * 1000;
    const convAt = conversion.occurredAt.getTime();
    const raw = inWindow.map((tp) => {
      const ageMs = convAt - tp.occurredAt.getTime();
      return { touchpointId: tp.id, weight: Math.pow(2, -ageMs / halfLifeMs) };
    });
    return normalizeWeights(raw);
  },
};
