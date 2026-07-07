import type {
  AttributableConversion,
  AttributableTouchpoint,
  AttributionConfig,
  AttributionModel,
  AttributionWeight,
} from '../attribution.types';
import { applyAttributionWindow, normalizeWeights } from '../attribution.utils';

/** Equal credit to every touch in the window. */
export const linearModel: AttributionModel = {
  name: 'linear',
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
    return normalizeWeights(
      inWindow.map((tp) => ({ touchpointId: tp.id, weight: 1 })),
    );
  },
};
