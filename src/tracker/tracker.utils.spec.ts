import {
  generateSessionId,
  hostnameOf,
  isDomainAllowed,
  pickAttribution,
} from './tracker.utils';

describe('hostnameOf', () => {
  it('extracts the hostname from a full URL', () => {
    expect(hostnameOf('https://www.libertyplay.click/checkout')).toBe(
      'www.libertyplay.click',
    );
  });

  it('returns null for undefined input', () => {
    expect(hostnameOf(undefined)).toBeNull();
  });

  it('returns null for an invalid URL', () => {
    expect(hostnameOf('not-a-url')).toBeNull();
  });
});

describe('isDomainAllowed', () => {
  it('allows any origin when there is nothing to check against', () => {
    expect(isDomainAllowed(null, [])).toBe(true);
    expect(isDomainAllowed('example.com', [])).toBe(true);
  });

  it('allows an origin present in the allowed list', () => {
    expect(isDomainAllowed('libertyplay.click', ['libertyplay.click'])).toBe(
      true,
    );
  });

  it('rejects an origin absent from the allowed list', () => {
    expect(isDomainAllowed('evil.com', ['libertyplay.click'])).toBe(false);
  });
});

describe('generateSessionId', () => {
  it('generates a well-formed UUID', () => {
    const id = generateSessionId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('generates unique values across calls', () => {
    expect(generateSessionId()).not.toBe(generateSessionId());
  });
});

describe('pickAttribution', () => {
  it('picks only the present attribution fields', () => {
    expect(
      pickAttribution({
        utmSource: 'google',
        gclid: 'abc',
        utmMedium: undefined,
      }),
    ).toEqual({ utmSource: 'google', gclid: 'abc' });
  });

  it('returns an empty object when nothing is present', () => {
    expect(pickAttribution({})).toEqual({});
  });
});
