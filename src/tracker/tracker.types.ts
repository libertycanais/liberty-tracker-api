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
  /** Attribution (Sprint 4.1) — all optional, defaults resolved at runtime. */
  attributionModel?: string;
  attributionWindowDays?: number;
  timeDecayHalfLifeDays?: number;
  positionWeights?: [number, number];
  /** SDK feature flags embedded in the generated tracker.js. */
  sdkFlags?: Record<string, boolean>;
  /** Escape hatch for testing features without schema changes. */
  experimental?: Record<string, unknown>;
}

export interface ResolvedTrackerConfig {
  sessionTimeoutMinutes: number;
  heartbeatIntervalSeconds: number;
  allowedEvents: string[];
  blockedEvents: string[];
  allowedDomains: string[];
  rateLimitPerMinute: number;
  attributionModel: string;
  attributionWindowDays: number;
  timeDecayHalfLifeDays: number;
  positionWeights: [number, number];
  experimental: Record<string, unknown>;
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
