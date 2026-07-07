import type { CanonicalEvent } from '../contracts/canonical.types';
import {
  browserNormalizer,
  campaignNormalizer,
  createDefaultNormalizerPipeline,
  normalizeCountryCode,
  normalizeDeviceType,
  normalizeMedium,
  normalizeSource,
  NormalizerPipeline,
} from './normalization.engine';

function makeEvent(overrides: Partial<CanonicalEvent> = {}): CanonicalEvent {
  return {
    eventVersion: 1,
    origin: 'browser',
    eventId: 'e1',
    eventName: 'PageView',
    eventType: 'PAGE_VIEW',
    occurredAt: new Date(),
    identity: { visitorId: 'v1' },
    ...overrides,
  };
}

describe('normalizeSource', () => {
  it('collapses aliases and case (Facebook/FACEBOOK/fb → facebook)', () => {
    expect(normalizeSource('Facebook')).toBe('facebook');
    expect(normalizeSource('FACEBOOK')).toBe('facebook');
    expect(normalizeSource('fb')).toBe('facebook');
    expect(normalizeSource('facebook.com')).toBe('facebook');
    expect(normalizeSource('adwords')).toBe('google');
    expect(normalizeSource('x.com')).toBe('twitter');
  });
  it('passes unknown sources through lowercased', () => {
    expect(normalizeSource('MyNewsletter')).toBe('mynewsletter');
    expect(normalizeSource(undefined)).toBeUndefined();
  });
});

describe('normalizeMedium / country / device', () => {
  it('maps medium aliases to canonical values', () => {
    expect(normalizeMedium('PPC')).toBe('cpc');
    expect(normalizeMedium('PaidSearch')).toBe('cpc');
    expect(normalizeMedium('banner')).toBe('display');
  });
  it('uppercases country codes', () => {
    expect(normalizeCountryCode('br')).toBe('BR');
  });
  it('canonicalizes device types', () => {
    expect(normalizeDeviceType('iPhone')).toBe('mobile');
    expect(normalizeDeviceType('iPad')).toBe('tablet');
    expect(normalizeDeviceType('Windows PC')).toBe('desktop');
  });
});

describe('NormalizerPipeline (registrable)', () => {
  it('runs registered normalizers in order and supports register/unregister', () => {
    const pipeline = new NormalizerPipeline();
    pipeline.register({
      name: 'a',
      normalize: (e) => ({ ...e, eventName: e.eventName + '-a' }),
    });
    pipeline.register({
      name: 'b',
      normalize: (e) => ({ ...e, eventName: e.eventName + '-b' }),
    });
    expect(pipeline.run(makeEvent()).eventName).toBe('PageView-a-b');

    pipeline.unregister('a');
    expect(pipeline.run(makeEvent()).eventName).toBe('PageView-b');
    expect(pipeline.list()).toHaveLength(1);
  });

  it('default pipeline normalizes campaign + browser + geo', () => {
    const pipeline = createDefaultNormalizerPipeline();
    const out = pipeline.run(
      makeEvent({
        campaign: { source: 'FB', medium: 'PPC', campaign: ' Summer ' },
        context: {
          browser: { browser: 'Google Chrome', deviceType: 'iPhone' },
        },
        geo: { countryCode: 'br' },
      }),
    );
    expect(out.campaign?.source).toBe('facebook'); // FB → fb → alias → facebook
    expect(out.campaign?.medium).toBe('cpc');
    expect(out.campaign?.campaign).toBe('summer');
    expect((out.context?.browser as { browser: string }).browser).toBe(
      'chrome',
    );
    expect(out.geo?.countryCode).toBe('BR');
  });
});

describe('individual normalizers are pure (no mutation of input)', () => {
  it('campaignNormalizer does not mutate the original event', () => {
    const original = makeEvent({ campaign: { source: 'FB' } });
    campaignNormalizer.normalize(original);
    expect(original.campaign?.source).toBe('FB');
  });
  it('browserNormalizer no-ops without context', () => {
    const e = makeEvent();
    expect(browserNormalizer.normalize(e)).toBe(e);
  });
});
