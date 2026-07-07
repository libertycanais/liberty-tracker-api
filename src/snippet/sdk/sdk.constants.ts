/**
 * Shared constants for the Liberty Tracker SDK.
 *
 * These live in TS (testable in Node) and are also serialized into the
 * generated tracker.js via SnippetService. Keep everything here plain
 * data so it can be embedded as JSON in the browser bundle.
 */

/** Protocol/versioning — decoupled per the enterprise spec (Sprint 4.1). */
export const SDK_VERSION = '4.1.0';
export const SCHEMA_VERSION = 1;
export const EVENT_VERSION = 1;

/**
 * Click IDs captured from the URL and persisted sticky across sessions.
 * Order matters only for deterministic output in tests.
 */
export const CLICK_ID_PARAMS = [
  'gclid',
  'gbraid',
  'wbraid',
  'fbclid',
  'ttclid',
  'msclkid',
  'twclid',
  'li_fat_id',
  'yclid',
  'dclid',
  'epik',
] as const;

export type ClickIdParam = (typeof CLICK_ID_PARAMS)[number];

export const UTM_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
] as const;

/** Capabilities advertised by the SDK (exposed at window.libertyTracker.capabilities). */
export const SDK_CAPABILITIES = [
  'offlineQueue',
  'batch',
  'retry',
  'fingerprint',
  'geo',
  'heartbeat',
  'hooks',
  'consent',
  'debug',
] as const;

/** Consent categories (LGPD-style). */
export const CONSENT_CATEGORIES = [
  'necessary',
  'functional',
  'analytics',
  'marketing',
] as const;

export type ConsentCategory = (typeof CONSENT_CATEGORIES)[number];

/** Retry policy defaults. */
export const RETRY_BASE_DELAY_MS = 1000;
export const RETRY_MAX_DELAY_MS = 30000;
export const RETRY_MAX_ATTEMPTS = 8;

/** Batch policy defaults. */
export const BATCH_MAX_SIZE = 20;
export const BATCH_MAX_WAIT_MS = 5000;

/** Fingerprint composition version (see SDK.md). v1 = canvas+tz+screen+platform+language. */
export const FINGERPRINT_VERSION = 1;
