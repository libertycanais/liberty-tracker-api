import type { CanonicalEvent } from '../contracts/canonical.types';
import {
  createDefaultValidationEngine,
  IdentityRules,
  isNumber,
  isUrl,
  maxLen,
  required,
  ValidationEngine,
} from './validation.engine';

function makeEvent(overrides: Partial<CanonicalEvent> = {}): CanonicalEvent {
  return {
    eventVersion: 1,
    origin: 'browser',
    eventId: 'evt-123456',
    eventName: 'PageView',
    eventType: 'PAGE_VIEW',
    occurredAt: new Date(),
    identity: { visitorId: 'visitor-123' },
    ...overrides,
  };
}

describe('rule primitives', () => {
  it('required flags null/empty', () => {
    const rule = required('x', () => '');
    expect(rule(makeEvent())?.rule).toBe('required');
    expect(required('x', () => 'ok')(makeEvent())).toBeNull();
  });

  it('isUrl accepts valid URLs and absence, rejects garbage', () => {
    expect(isUrl('x', () => 'https://a.com/b')(makeEvent())).toBeNull();
    expect(isUrl('x', () => undefined)(makeEvent())).toBeNull();
    expect(isUrl('x', () => 'not a url')(makeEvent())?.rule).toBe('url');
  });

  it('isNumber rejects NaN and non-numbers, accepts absence', () => {
    expect(isNumber('x', () => 5)(makeEvent())).toBeNull();
    expect(isNumber('x', () => undefined)(makeEvent())).toBeNull();
    expect(isNumber('x', () => 'five')(makeEvent())?.rule).toBe('number');
    expect(isNumber('x', () => NaN)(makeEvent())?.rule).toBe('number');
  });

  it('maxLen enforces the limit', () => {
    expect(maxLen('x', 3, () => 'abcd')(makeEvent())?.rule).toBe('maxLen');
    expect(maxLen('x', 3, () => 'abc')(makeEvent())).toBeNull();
  });
});

describe('default ValidationEngine (RuleSets)', () => {
  const engine = createDefaultValidationEngine();

  it('passes a well-formed canonical event with zero violations', () => {
    expect(engine.validate(makeEvent())).toEqual([]);
  });

  it('passes an event WITHOUT eventId (generated later at persist)', () => {
    expect(engine.validate(makeEvent({ eventId: '' }))).toEqual([]);
  });

  it('flags a missing visitorId via IdentityRules', () => {
    const violations = engine.validate(
      makeEvent({ identity: { visitorId: '' } }),
    );
    expect(violations.some((v) => v.field === 'visitorId')).toBe(true);
  });

  it('flags oversized click IDs via ClickIdRules', () => {
    const violations = engine.validate(
      makeEvent({ campaign: { clickIds: { gclid: 'x'.repeat(600) } } }),
    );
    expect(violations.some((v) => v.rule === 'clickid')).toBe(true);
  });

  it('flags an invalid landing page URL via CampaignRules', () => {
    const violations = engine.validate(
      makeEvent({ campaign: { landingPage: 'nope' } }),
    );
    expect(violations.some((v) => v.field === 'campaign.landingPage')).toBe(
      true,
    );
  });

  it('supports registering additional rule sets', () => {
    const custom = new ValidationEngine();
    custom.register(IdentityRules);
    custom.register({
      name: 'custom',
      rules: [() => ({ rule: 'always', field: '*', message: 'always fails' })],
    });
    expect(custom.validate(makeEvent()).some((v) => v.rule === 'always')).toBe(
      true,
    );
    expect(custom.list()).toHaveLength(2);
  });
});
