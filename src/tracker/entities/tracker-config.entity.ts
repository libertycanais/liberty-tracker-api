import {
  DEFAULT_HEARTBEAT_INTERVAL_SECONDS,
  DEFAULT_RATE_LIMIT_PER_MINUTE,
  DEFAULT_SESSION_TIMEOUT_MINUTES,
} from '../tracker.constants';
import type { ResolvedTrackerConfig, TrackerConfig } from '../tracker.types';
import { DEFAULT_ATTRIBUTION_CONFIG } from '../../attribution/attribution.types';

export function resolveTrackerConfig(
  raw: TrackerConfig | null | undefined,
  defaultRateLimitPerMinute: number = DEFAULT_RATE_LIMIT_PER_MINUTE,
): ResolvedTrackerConfig {
  return {
    sessionTimeoutMinutes:
      raw?.sessionTimeoutMinutes ?? DEFAULT_SESSION_TIMEOUT_MINUTES,
    heartbeatIntervalSeconds:
      raw?.heartbeatIntervalSeconds ?? DEFAULT_HEARTBEAT_INTERVAL_SECONDS,
    allowedEvents: raw?.allowedEvents ?? [],
    blockedEvents: raw?.blockedEvents ?? [],
    allowedDomains: raw?.allowedDomains ?? [],
    rateLimitPerMinute: raw?.rateLimitPerMinute ?? defaultRateLimitPerMinute,
    attributionModel: raw?.attributionModel ?? DEFAULT_ATTRIBUTION_CONFIG.model,
    attributionWindowDays:
      raw?.attributionWindowDays ?? DEFAULT_ATTRIBUTION_CONFIG.windowDays,
    timeDecayHalfLifeDays:
      raw?.timeDecayHalfLifeDays ??
      DEFAULT_ATTRIBUTION_CONFIG.timeDecayHalfLifeDays,
    positionWeights:
      raw?.positionWeights ?? DEFAULT_ATTRIBUTION_CONFIG.positionWeights,
    experimental: raw?.experimental ?? {},
  };
}

export function isEventNameAllowed(
  config: ResolvedTrackerConfig,
  eventName: string,
): boolean {
  if (config.blockedEvents.includes(eventName)) {
    return false;
  }
  if (config.allowedEvents.length > 0) {
    return config.allowedEvents.includes(eventName);
  }
  return true;
}
