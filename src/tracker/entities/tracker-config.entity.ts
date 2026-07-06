import {
  DEFAULT_HEARTBEAT_INTERVAL_SECONDS,
  DEFAULT_SESSION_TIMEOUT_MINUTES,
} from '../tracker.constants';
import type { ResolvedTrackerConfig, TrackerConfig } from '../tracker.types';

export function resolveTrackerConfig(
  raw: TrackerConfig | null | undefined,
): ResolvedTrackerConfig {
  return {
    sessionTimeoutMinutes:
      raw?.sessionTimeoutMinutes ?? DEFAULT_SESSION_TIMEOUT_MINUTES,
    heartbeatIntervalSeconds:
      raw?.heartbeatIntervalSeconds ?? DEFAULT_HEARTBEAT_INTERVAL_SECONDS,
    allowedEvents: raw?.allowedEvents ?? [],
    blockedEvents: raw?.blockedEvents ?? [],
    allowedDomains: raw?.allowedDomains ?? [],
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
