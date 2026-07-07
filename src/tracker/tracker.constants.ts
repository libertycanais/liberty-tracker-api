export const TRACKER_REDIS_KEY_PREFIX = 'lt';

export const DEFAULT_SESSION_TIMEOUT_MINUTES = 30;
export const DEFAULT_HEARTBEAT_INTERVAL_SECONDS = 15;
export const DEFAULT_RATE_LIMIT_PER_MINUTE = 120;

export const RATE_LIMIT_WINDOW_SECONDS = 60;

export const VISITOR_TTL_SECONDS = 400 * 24 * 60 * 60;
export const ATTRIBUTION_TTL_SECONDS = 90 * 24 * 60 * 60;

export const ATTRIBUTION_FIELDS = [
  'utmSource',
  'utmMedium',
  'utmCampaign',
  'utmTerm',
  'utmContent',
  'fbclid',
  'gclid',
] as const;
