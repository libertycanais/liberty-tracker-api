import type {
  AttributableConversion,
  AttributableTouchpoint,
  AttributionConfig,
  AttributionModel,
  AttributionWeight,
} from '../attribution.types';
import { applyAttributionWindow, normalizeWeights } from '../attribution.utils';

/**
 * U-shaped: configurable first/last weights (default 40/40), the remainder
 * split evenly among the middle touches. Weights come from config — never
 * hardcoded.
 */
export const positionBasedModel: AttributionModel = {
  name: 'position-based',
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
    const n = inWindow.length;
    if (n === 0) return [];
    if (n === 1)
      return normalizeWeights([{ touchpointId: inWindow[0].id, weight: 1 }]);

    const [firstW, lastW] = config.positionWeights;
    if (n === 2) {
      return normalizeWeights([
        { touchpointId: inWindow[0].id, weight: firstW },
        { touchpointId: inWindow[1].id, weight: lastW },
      ]);
    }

    const middleTotal = Math.max(0, 1 - firstW - lastW);
    const middleEach = middleTotal / (n - 2);
    const raw = inWindow.map((tp, i) => {
      let weight = middleEach;
      if (i === 0) weight = firstW;
      else if (i === n - 1) weight = lastW;
      return { touchpointId: tp.id, weight };
    });
    return normalizeWeights(raw);
  },
};
