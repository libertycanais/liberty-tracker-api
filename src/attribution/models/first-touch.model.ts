import type {
  AttributableConversion,
  AttributableTouchpoint,
  AttributionConfig,
  AttributionModel,
  AttributionWeight,
} from '../attribution.types';
import { applyAttributionWindow, normalizeWeights } from '../attribution.utils';

/** 100% of the credit to the first touch in the window. */
export const firstTouchModel: AttributionModel = {
  name: 'first-touch',
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
    return normalizeWeights([{ touchpointId: inWindow[0].id, weight: 1 }]);
  },
};
