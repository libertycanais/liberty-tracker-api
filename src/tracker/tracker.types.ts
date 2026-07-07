import type { ATTRIBUTION_FIELDS } from './tracker.constants';

export type AttributionField = (typeof ATTRIBUTION_FIELDS)[number];

export type AttributionData = Partial<Record<AttributionField, string>>;

export interface TrackerConfig {
  sessionTimeoutMinutes?: number;
  heartbeatIntervalSeconds?: number;
  allowedEvents?: string[];
  blockedEvents?: string[];
  allowedDomains?: string[];
  rateLimitPerMinute?: number;
}

export interface ResolvedTrackerConfig {
  sessionTimeoutMinutes: number;
  heartbeatIntervalSeconds: number;
  allowedEvents: string[];
  blockedEvents: string[];
  allowedDomains: string[];
  rateLimitPerMinute: number;
}

export interface VisitorState {
  isNewVisitor: boolean;
  firstSeenAt: Date;
  sessionCount: number;
}

export interface SessionState {
  sessionId: string;
  isNewSession: boolean;
  sessionStartedAt: Date;
}
