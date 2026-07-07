import type { CanonicalEvent } from '../contracts/canonical.types';

/**
 * Normalization Engine (Sprint 4.1) — pure normalizers composed in a
 * REGISTRABLE pipeline. Sprint 5 plugs GoogleAds/GA4/Meta/TikTok
 * normalizers via `register()` without changing this file.
 */
export interface Normalizer {
  readonly name: string;
  normalize(event: CanonicalEvent): CanonicalEvent;
}

export class NormalizerPipeline {
  private readonly normalizers: Normalizer[] = [];

  register(normalizer: Normalizer): void {
    this.normalizers.push(normalizer);
  }

  unregister(name: string): void {
    const idx = this.normalizers.findIndex((n) => n.name === name);
    if (idx >= 0) this.normalizers.splice(idx, 1);
  }

  list(): Normalizer[] {
    return [...this.normalizers];
  }

  clear(): void {
    this.normalizers.length = 0;
  }

  run(event: CanonicalEvent): CanonicalEvent {
    return this.normalizers.reduce((ev, n) => n.normalize(ev), event);
  }
}

// ---------- pure normalization helpers ----------

const SOURCE_ALIASES: Record<string, string> = {
  fb: 'facebook',
  'facebook.com': 'facebook',
  'm.facebook.com': 'facebook',
  ig: 'instagram',
  'instagram.com': 'instagram',
  'google.com': 'google',
  adwords: 'google',
  'twitter.com': 'twitter',
  'x.com': 'twitter',
  't.co': 'twitter',
  'linkedin.com': 'linkedin',
  'tiktok.com': 'tiktok',
  'bing.com': 'bing',
  'pinterest.com': 'pinterest',
};

export function normalizeSource(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  const lower = raw.trim().toLowerCase();
  return SOURCE_ALIASES[lower] ?? lower;
}

const MEDIUM_ALIASES: Record<string, string> = {
  ppc: 'cpc',
  paidsearch: 'cpc',
  'paid-search': 'cpc',
  paid_social: 'paid-social',
  paidsocial: 'paid-social',
  banner: 'display',
};

export function normalizeMedium(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  const lower = raw.trim().toLowerCase();
  return MEDIUM_ALIASES[lower] ?? lower;
}

export function normalizeCampaignName(
  raw: string | undefined,
): string | undefined {
  if (!raw) return raw;
  return raw.trim().toLowerCase();
}

export function normalizeCountryCode(
  raw: string | undefined,
): string | undefined {
  if (!raw) return raw;
  return raw.trim().toUpperCase();
}

export function normalizeBrowserName(
  raw: string | undefined,
): string | undefined {
  if (!raw) return raw;
  const lower = raw.trim().toLowerCase();
  const map: Record<string, string> = {
    'google chrome': 'chrome',
    'microsoft edge': 'edge',
    'mozilla firefox': 'firefox',
    'apple safari': 'safari',
  };
  return map[lower] ?? lower;
}

export function normalizeDeviceType(
  raw: string | undefined,
): string | undefined {
  if (!raw) return raw;
  const lower = raw.trim().toLowerCase();
  if (/tablet|ipad/.test(lower)) return 'tablet';
  if (/mobile|phone|android|iphone/.test(lower)) return 'mobile';
  if (/desktop|pc|mac|windows|linux/.test(lower)) return 'desktop';
  return lower;
}

// ---------- built-in normalizers ----------

export const campaignNormalizer: Normalizer = {
  name: 'campaign',
  normalize(event) {
    if (!event.campaign) return event;
    return {
      ...event,
      campaign: {
        ...event.campaign,
        source: normalizeSource(event.campaign.source),
        medium: normalizeMedium(event.campaign.medium),
        campaign: normalizeCampaignName(event.campaign.campaign),
      },
    };
  },
};

export const browserNormalizer: Normalizer = {
  name: 'browser',
  normalize(event) {
    const browser = event.context?.browser as
      { browser?: string; deviceType?: string } | undefined;
    if (!browser) return event;
    return {
      ...event,
      context: {
        ...event.context,
        browser: {
          ...browser,
          browser: normalizeBrowserName(browser.browser),
          deviceType: normalizeDeviceType(browser.deviceType),
        },
      },
    };
  },
};

export const geoNormalizer: Normalizer = {
  name: 'geo',
  normalize(event) {
    if (!event.geo?.countryCode) return event;
    return {
      ...event,
      geo: {
        ...event.geo,
        countryCode: normalizeCountryCode(event.geo.countryCode),
      },
    };
  },
};

/** Default pipeline with the built-in normalizers registered. */
export function createDefaultNormalizerPipeline(): NormalizerPipeline {
  const pipeline = new NormalizerPipeline();
  pipeline.register(campaignNormalizer);
  pipeline.register(browserNormalizer);
  pipeline.register(geoNormalizer);
  return pipeline;
}
