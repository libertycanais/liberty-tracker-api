/**
 * Canonical data contracts (Sprint 4.1).
 *
 * Shared internal shapes that new modules speak. The HTTP DTO remains the
 * ingress boundary; the pipeline's Normalize stage maps DTO → canonical.
 * Every top-level contract carries `metadata`/`custom`/`extensions`/`labels`
 * so it can evolve without breaking. Nothing here is persisted verbatim —
 * these are in-memory contracts, not Prisma models.
 */

export type EventOrigin =
  'browser' | 'server' | 'api' | 'import' | 'replay' | 'migration';

export interface CanonicalIdentity {
  anonymousId?: string;
  visitorId: string;
  userId?: string;
  externalId?: string;
  crmId?: string;
}

export interface CanonicalCampaign {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
  network?: string;
  channel?: string;
  clickIds?: Record<string, string>;
  landingPage?: string;
  referrer?: string;
}

export interface CanonicalContext {
  browser?: Record<string, unknown>;
  device?: Record<string, unknown>;
  screen?: Record<string, unknown>;
  network?: Record<string, unknown>;
  locale?: Record<string, unknown>;
  page?: Record<string, unknown>;
  fingerprintHash?: string;
  fingerprintVersion?: number;
}

export interface CanonicalGeo {
  country?: string;
  countryCode?: string;
  region?: string;
  state?: string;
  city?: string;
  timezone?: string;
  latitude?: number;
  longitude?: number;
  asn?: string;
  isp?: string;
  ipVersion?: 4 | 6;
}

interface CanonicalBase {
  metadata?: Record<string, unknown>;
  custom?: Record<string, unknown>;
  extensions?: Record<string, unknown>;
  labels?: string[];
}

export interface CanonicalEvent extends CanonicalBase {
  /** Protocol version of the event format, decoupled from SDK version. */
  eventVersion: number;
  schemaVersion?: number;
  sdkVersion?: string;
  apiVersion?: string;
  origin: EventOrigin;
  eventId: string;
  eventName: string;
  eventType: string;
  occurredAt: Date;
  identity: CanonicalIdentity;
  sessionId?: string;
  campaign?: CanonicalCampaign;
  context?: CanonicalContext;
  geo?: CanonicalGeo;
  value?: number;
  currency?: string;
}

export interface CanonicalVisitor extends CanonicalBase {
  projectId: string;
  visitorId: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  sessionCount: number;
  eventCount: number;
  clickIds?: Record<string, string>;
  firstTouch?: CanonicalCampaign;
  lastTouch?: CanonicalCampaign;
  context?: CanonicalContext;
  geo?: CanonicalGeo;
  fingerprintHash?: string;
  fingerprintVersion?: number;
}

export interface CanonicalSession extends CanonicalBase {
  sessionId: string;
  visitorId: string;
  startedAt: Date;
  isNew: boolean;
}

export interface CanonicalTouchpoint extends CanonicalBase {
  projectId: string;
  visitorId: string;
  sessionId?: string;
  occurredAt: Date;
  position: number;
  campaign?: CanonicalCampaign;
  channel?: string;
  eventType: string;
  eventName: string;
  isConversion: boolean;
  value?: number;
}

export interface CanonicalConversion extends CanonicalBase {
  projectId: string;
  visitorId: string;
  occurredAt: Date;
  eventName: string;
  value?: number;
  currency?: string;
}
