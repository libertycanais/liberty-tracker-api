import type {
  AttributableConversion,
  AttributableTouchpoint,
  AttributionConfig,
  AttributionModel,
  AttributionWeight,
} from '../attribution.types';
import { linearModel } from './linear.model';

/**
 * Data-driven attribution — STRUCTURE-READY ONLY (Sprint 4.1).
 *
 * No ML in this sprint: it falls back to Linear and marks the result so
 * callers know the credit is a placeholder. The real model (Sprint 8) plugs
 * in here via the registry without changing any caller.
 */
export const dataDrivenModel: AttributionModel = {
  name: 'data-driven',
  supports: () => true,
  calculate(
    touchpoints: AttributableTouchpoint[],
    conversion: AttributableConversion,
    config: AttributionConfig,
  ): AttributionWeight[] {
    // Fallback: linear distribution until an ML model is trained.
    return linearModel.calculate(touchpoints, conversion, config);
  },
};

/** Marker so observability/exports can flag data-driven as a fallback for now. */
export const DATA_DRIVEN_IS_FALLBACK = true;
