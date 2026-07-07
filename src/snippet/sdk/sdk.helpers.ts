/**
 * Pure, self-contained SDK helpers.
 *
 * Every function here is browser-agnostic (no window/navigator/document
 * access) and written in a conservative style so it can be BOTH unit-tested
 * in Node AND serialized into the generated tracker.js via `.toString()`
 * (old-browser safe). Do not import runtime values into these functions.
 */

export interface ParsedCampaign {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
  channel: string;
}

/** Extract known click IDs from a URL query string (e.g. `?gclid=x&fbclid=y`). */
export function parseClickIds(search: string): Record<string, string> {
  const params = new URLSearchParams(search || '');
  const keys = [
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
  ];
  const out: Record<string, string> = {};
  for (let i = 0; i < keys.length; i++) {
    const v = params.get(keys[i]);
    if (v) out[keys[i]] = v;
  }
  return out;
}

/** Extract utm_* params from a URL query string. */
export function parseUtms(search: string): Record<string, string> {
  const params = new URLSearchParams(search || '');
  const keys = [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
  ];
  const out: Record<string, string> = {};
  for (let i = 0; i < keys.length; i++) {
    const v = params.get(keys[i]);
    if (v) out[keys[i]] = v;
  }
  return out;
}

/**
 * Classify the marketing channel from click IDs, UTMs and referrer.
 * Priority: explicit click IDs → utm_medium → referrer host → direct.
 */
export function classifyChannel(input: {
  clickIds?: Record<string, string>;
  utms?: Record<string, string>;
  referrer?: string;
}): string {
  const clickIds = input.clickIds || {};
  const utms = input.utms || {};

  if (clickIds.gclid || clickIds.gbraid || clickIds.wbraid || clickIds.dclid) {
    return 'google_ads';
  }
  if (clickIds.fbclid) return 'meta_ads';
  if (clickIds.ttclid) return 'tiktok_ads';
  if (clickIds.msclkid) return 'microsoft_ads';
  if (clickIds.li_fat_id) return 'linkedin_ads';
  if (clickIds.twclid) return 'twitter_ads';
  if (clickIds.epik) return 'pinterest_ads';
  if (clickIds.yclid) return 'yandex_ads';

  const medium = (utms.utm_medium || '').toLowerCase();
  if (medium) {
    if (/cpc|ppc|paid|paidsearch/.test(medium)) return 'paid_search';
    if (/display|banner|cpm/.test(medium)) return 'display';
    if (/social|social-network|social-media/.test(medium)) return 'social';
    if (/email|newsletter/.test(medium)) return 'email';
    if (/sms|text/.test(medium)) return 'sms';
    if (/push/.test(medium)) return 'push';
    if (/affiliate/.test(medium)) return 'affiliate';
    if (/referral/.test(medium)) return 'referral';
    if (/organic/.test(medium)) return 'organic';
  }
  if (utms.utm_source) return 'campaign';

  const ref = (input.referrer || '').toLowerCase();
  if (ref) {
    if (
      /facebook|instagram|t\.co|twitter|linkedin|tiktok|pinterest|reddit/.test(
        ref,
      )
    ) {
      return 'social';
    }
    if (/google|bing|yahoo|duckduckgo|yandex|baidu/.test(ref))
      return 'organic_search';
    return 'referral';
  }
  return 'direct';
}

/** Build a normalized campaign object from URL parts. */
export function parseCampaign(input: {
  search: string;
  referrer?: string;
}): ParsedCampaign {
  const utms = parseUtms(input.search);
  const clickIds = parseClickIds(input.search);
  return {
    source: utms.utm_source,
    medium: utms.utm_medium,
    campaign: utms.utm_campaign,
    term: utms.utm_term,
    content: utms.utm_content,
    channel: classifyChannel({ clickIds, utms, referrer: input.referrer }),
  };
}

/** Lightweight, dependency-free User-Agent parsing (family-level, best effort). */
export function detectBrowser(ua: string): {
  browser: string;
  browserVersion: string;
} {
  const s = ua || '';
  const tests: Array<[string, RegExp]> = [
    ['Edge', /Edg(?:e|A|iOS)?\/([\d.]+)/],
    ['Opera', /OPR\/([\d.]+)/],
    ['Samsung', /SamsungBrowser\/([\d.]+)/],
    ['Chrome', /Chrome\/([\d.]+)/],
    ['Firefox', /Firefox\/([\d.]+)/],
    ['Safari', /Version\/([\d.]+).*Safari/],
    ['IE', /MSIE ([\d.]+)|Trident.*rv:([\d.]+)/],
  ];
  for (let i = 0; i < tests.length; i++) {
    const m = s.match(tests[i][1]);
    if (m) return { browser: tests[i][0], browserVersion: m[1] || m[2] || '' };
  }
  return { browser: 'Unknown', browserVersion: '' };
}

export function detectOs(ua: string): {
  operatingSystem: string;
  operatingSystemVersion: string;
} {
  const s = ua || '';
  if (/Windows NT ([\d.]+)/.test(s)) {
    return { operatingSystem: 'Windows', operatingSystemVersion: RegExp.$1 };
  }
  if (/Android ([\d.]+)/.test(s)) {
    return { operatingSystem: 'Android', operatingSystemVersion: RegExp.$1 };
  }
  if (/(?:iPhone|iPad).*OS ([\d_]+)/.test(s)) {
    return {
      operatingSystem: 'iOS',
      operatingSystemVersion: RegExp.$1.replace(/_/g, '.'),
    };
  }
  if (/Mac OS X ([\d_]+)/.test(s)) {
    return {
      operatingSystem: 'macOS',
      operatingSystemVersion: RegExp.$1.replace(/_/g, '.'),
    };
  }
  if (/Linux/.test(s))
    return { operatingSystem: 'Linux', operatingSystemVersion: '' };
  return { operatingSystem: 'Unknown', operatingSystemVersion: '' };
}

export function detectDeviceType(ua: string): string {
  const s = ua || '';
  if (/iPad|Tablet/.test(s)) return 'tablet';
  if (/Mobi|Android|iPhone/.test(s)) return 'mobile';
  return 'desktop';
}

/** Exponential backoff with full jitter, capped. Deterministic when `rand` is supplied. */
export function computeBackoff(
  attempt: number,
  opts?: { base?: number; max?: number; rand?: () => number },
): number {
  const base = (opts && opts.base) || 1000;
  const max = (opts && opts.max) || 30000;
  const rand = (opts && opts.rand) || Math.random;
  const exp = Math.min(max, base * Math.pow(2, Math.max(0, attempt)));
  return Math.floor(rand() * exp);
}

/** Stable dedup key for an event — used to guarantee an eventId is never sent twice. */
export function dedupKey(eventId: string): string {
  return 'lt_dedup_' + eventId;
}

/** Decide whether the batch should flush now. */
export function shouldFlushBatch(input: {
  size: number;
  oldestAgeMs: number;
  maxSize?: number;
  maxWaitMs?: number;
  forced?: boolean;
}): boolean {
  if (input.forced) return input.size > 0;
  const maxSize = input.maxSize || 20;
  const maxWait = input.maxWaitMs || 5000;
  if (input.size >= maxSize) return true;
  if (input.size > 0 && input.oldestAgeMs >= maxWait) return true;
  return false;
}

/**
 * Compute a stable fingerprint hash (djb2) from passive components.
 * v1 = canvas + timezone + screen + platform + language. Complementary to
 * visitorId, never a replacement.
 */
export function computeFingerprint(components: {
  canvas?: string;
  timezone?: string;
  screen?: string;
  platform?: string;
  language?: string;
}): string {
  const parts = [
    components.canvas || '',
    components.timezone || '',
    components.screen || '',
    components.platform || '',
    components.language || '',
  ].join('|');
  let hash = 5381;
  for (let i = 0; i < parts.length; i++) {
    hash = (hash * 33) ^ parts.charCodeAt(i);
  }
  // unsigned + base36
  return (hash >>> 0).toString(36);
}
