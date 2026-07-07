import {
  classifyChannel,
  computeBackoff,
  computeFingerprint,
  dedupKey,
  detectBrowser,
  detectDeviceType,
  detectOs,
  parseCampaign,
  parseClickIds,
  parseUtms,
  shouldFlushBatch,
} from './sdk.helpers';

describe('parseClickIds', () => {
  it('extracts every supported click ID present in the query string', () => {
    const result = parseClickIds(
      '?gclid=a&gbraid=b&wbraid=c&fbclid=d&ttclid=e&msclkid=f&twclid=g&li_fat_id=h&yclid=i&dclid=j&epik=k',
    );
    expect(result).toEqual({
      gclid: 'a',
      gbraid: 'b',
      wbraid: 'c',
      fbclid: 'd',
      ttclid: 'e',
      msclkid: 'f',
      twclid: 'g',
      li_fat_id: 'h',
      yclid: 'i',
      dclid: 'j',
      epik: 'k',
    });
  });

  it('returns an empty object when there are no click IDs', () => {
    expect(parseClickIds('?utm_source=google')).toEqual({});
    expect(parseClickIds('')).toEqual({});
  });
});

describe('parseUtms', () => {
  it('extracts only utm_* params', () => {
    expect(parseUtms('?utm_source=google&utm_medium=cpc&foo=bar')).toEqual({
      utm_source: 'google',
      utm_medium: 'cpc',
    });
  });
});

describe('classifyChannel', () => {
  it('maps click IDs to their ad platform', () => {
    expect(classifyChannel({ clickIds: { gclid: 'x' } })).toBe('google_ads');
    expect(classifyChannel({ clickIds: { fbclid: 'x' } })).toBe('meta_ads');
    expect(classifyChannel({ clickIds: { ttclid: 'x' } })).toBe('tiktok_ads');
    expect(classifyChannel({ clickIds: { msclkid: 'x' } })).toBe(
      'microsoft_ads',
    );
    expect(classifyChannel({ clickIds: { li_fat_id: 'x' } })).toBe(
      'linkedin_ads',
    );
    expect(classifyChannel({ clickIds: { epik: 'x' } })).toBe('pinterest_ads');
  });

  it('falls back to utm_medium classification', () => {
    expect(classifyChannel({ utms: { utm_medium: 'cpc' } })).toBe(
      'paid_search',
    );
    expect(classifyChannel({ utms: { utm_medium: 'email' } })).toBe('email');
    expect(classifyChannel({ utms: { utm_medium: 'social' } })).toBe('social');
  });

  it('classifies by referrer when no campaign data is present', () => {
    expect(classifyChannel({ referrer: 'https://www.google.com/' })).toBe(
      'organic_search',
    );
    expect(classifyChannel({ referrer: 'https://facebook.com/' })).toBe(
      'social',
    );
    expect(classifyChannel({ referrer: 'https://someblog.com/' })).toBe(
      'referral',
    );
  });

  it('returns direct when there is nothing to attribute', () => {
    expect(classifyChannel({})).toBe('direct');
  });
});

describe('parseCampaign', () => {
  it('produces a normalized campaign with channel', () => {
    const c = parseCampaign({
      search: '?utm_source=google&utm_medium=cpc&utm_campaign=summer&gclid=abc',
      referrer: '',
    });
    expect(c.source).toBe('google');
    expect(c.campaign).toBe('summer');
    expect(c.channel).toBe('google_ads');
  });
});

describe('detectBrowser', () => {
  it('detects Chrome', () => {
    const r = detectBrowser(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    );
    expect(r.browser).toBe('Chrome');
    expect(r.browserVersion.startsWith('120')).toBe(true);
  });

  it('detects Edge over Chrome', () => {
    expect(
      detectBrowser(
        'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
      ).browser,
    ).toBe('Edge');
  });

  it('returns Unknown for an empty UA', () => {
    expect(detectBrowser('').browser).toBe('Unknown');
  });
});

describe('detectOs / detectDeviceType', () => {
  it('detects Windows desktop', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
    expect(detectOs(ua).operatingSystem).toBe('Windows');
    expect(detectDeviceType(ua)).toBe('desktop');
  });

  it('detects Android mobile', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) Mobile';
    expect(detectOs(ua).operatingSystem).toBe('Android');
    expect(detectDeviceType(ua)).toBe('mobile');
  });
});

describe('computeBackoff', () => {
  it('grows exponentially and respects the cap (deterministic rand=1)', () => {
    const rand = () => 1;
    expect(computeBackoff(0, { base: 1000, max: 30000, rand })).toBe(1000);
    expect(computeBackoff(1, { base: 1000, max: 30000, rand })).toBe(2000);
    expect(computeBackoff(2, { base: 1000, max: 30000, rand })).toBe(4000);
    expect(computeBackoff(20, { base: 1000, max: 30000, rand })).toBe(30000);
  });

  it('applies jitter (rand=0 → 0)', () => {
    expect(computeBackoff(5, { rand: () => 0 })).toBe(0);
  });
});

describe('dedupKey', () => {
  it('is stable for the same eventId', () => {
    expect(dedupKey('evt-1')).toBe(dedupKey('evt-1'));
    expect(dedupKey('evt-1')).not.toBe(dedupKey('evt-2'));
  });
});

describe('shouldFlushBatch', () => {
  it('flushes when size reaches the max', () => {
    expect(shouldFlushBatch({ size: 20, oldestAgeMs: 0, maxSize: 20 })).toBe(
      true,
    );
    expect(shouldFlushBatch({ size: 19, oldestAgeMs: 0, maxSize: 20 })).toBe(
      false,
    );
  });

  it('flushes when the oldest item exceeds the wait window', () => {
    expect(
      shouldFlushBatch({ size: 1, oldestAgeMs: 6000, maxWaitMs: 5000 }),
    ).toBe(true);
  });

  it('forced flush drains any non-empty batch', () => {
    expect(shouldFlushBatch({ size: 3, oldestAgeMs: 0, forced: true })).toBe(
      true,
    );
    expect(shouldFlushBatch({ size: 0, oldestAgeMs: 0, forced: true })).toBe(
      false,
    );
  });
});

describe('computeFingerprint', () => {
  it('is deterministic for identical components', () => {
    const c = {
      canvas: 'abc',
      timezone: 'UTC',
      screen: '1920x1080',
      platform: 'Win32',
      language: 'en',
    };
    expect(computeFingerprint(c)).toBe(computeFingerprint(c));
  });

  it('changes when any component changes', () => {
    const base = {
      canvas: 'abc',
      timezone: 'UTC',
      screen: '1920x1080',
      platform: 'Win32',
      language: 'en',
    };
    expect(computeFingerprint(base)).not.toBe(
      computeFingerprint({ ...base, timezone: 'America/Sao_Paulo' }),
    );
  });
});
