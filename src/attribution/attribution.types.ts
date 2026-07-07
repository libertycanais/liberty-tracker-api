/** Attribution model identifiers (stored per project in trackerConfig). */
export const ATTRIBUTION_MODELS = [
  'first-touch',
  'last-touch',
  'linear',
  'position-based',
  'time-decay',
  'data-driven',
] as const;

export type AttributionModelName = (typeof ATTRIBUTION_MODELS)[number];

export const ATTRIBUTION_WINDOW_DAYS = [1, 7, 30, 60, 90, 180] as const;
export type AttributionWindowDays = (typeof ATTRIBUTION_WINDOW_DAYS)[number];

/** Minimal shape a touchpoint needs for attribution math (decoupled from Prisma). */
export interface AttributableTouchpoint {
  id: string;
  occurredAt: Date;
  isConversion: boolean;
}

export interface AttributableConversion {
  occurredAt: Date;
  value?: number;
}

/** Resolved attribution configuration (from trackerConfig, with defaults). */
export interface AttributionConfig {
  model: AttributionModelName;
  windowDays: number;
  timeDecayHalfLifeDays: number;
  /** [firstWeight, lastWeight] for position-based; the middle shares the rest. */
  positionWeights: [number, number];
}

/** One touchpoint's share of the conversion credit. Weights across a result sum to 1. */
export interface AttributionWeight {
  touchpointId: string;
  weight: number;
}

/** A single attribution model — pure, config-driven, no hardcoded constants. */
export interface AttributionModel {
  readonly name: AttributionModelName;
  /** Whether this model can run for the given config (e.g. licensing gates). */
  supports(config: AttributionConfig): boolean;
  calculate(
    touchpoints: AttributableTouchpoint[],
    conversion: AttributableConversion,
    config: AttributionConfig,
  ): AttributionWeight[];
}

export const DEFAULT_ATTRIBUTION_CONFIG: AttributionConfig = {
  model: 'last-touch',
  windowDays: 30,
  timeDecayHalfLifeDays: 7,
  positionWeights: [0.4, 0.4],
};
