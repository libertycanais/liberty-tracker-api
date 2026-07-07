import { AttributionModelRegistry } from './attribution-model.registry';
import { DEFAULT_ATTRIBUTION_CONFIG } from './attribution.types';
import type {
  AttributableTouchpoint,
  AttributionConfig,
} from './attribution.types';
import { applyAttributionWindow } from './attribution.utils';
import { firstTouchModel } from './models/first-touch.model';
import { lastTouchModel } from './models/last-touch.model';
import { linearModel } from './models/linear.model';
import { positionBasedModel } from './models/position-based.model';
import { timeDecayModel } from './models/time-decay.model';

const DAY = 24 * 60 * 60 * 1000;
const conversionAt = new Date('2026-02-01T00:00:00.000Z');

function tp(id: string, daysBefore: number): AttributableTouchpoint {
  return {
    id,
    occurredAt: new Date(conversionAt.getTime() - daysBefore * DAY),
    isConversion: false,
  };
}

const config: AttributionConfig = {
  ...DEFAULT_ATTRIBUTION_CONFIG,
  windowDays: 30,
};

function sum(weights: { weight: number }[]): number {
  return weights.reduce((s, w) => s + w.weight, 0);
}

describe('applyAttributionWindow', () => {
  it('drops touches outside the window and orders by time', () => {
    const points = [tp('a', 45), tp('b', 10), tp('c', 2)];
    const inWindow = applyAttributionWindow(points, conversionAt, 30);
    expect(inWindow.map((t) => t.id)).toEqual(['b', 'c']);
  });
});

describe('first-touch', () => {
  it('gives all credit to the earliest touch', () => {
    const r = firstTouchModel.calculate(
      [tp('a', 20), tp('b', 5)],
      { occurredAt: conversionAt },
      config,
    );
    expect(r).toEqual([{ touchpointId: 'a', weight: 1 }]);
  });
  it('returns empty when nothing is in the window', () => {
    expect(
      firstTouchModel.calculate(
        [tp('a', 90)],
        { occurredAt: conversionAt },
        config,
      ),
    ).toEqual([]);
  });
});

describe('last-touch', () => {
  it('gives all credit to the latest touch', () => {
    const r = lastTouchModel.calculate(
      [tp('a', 20), tp('b', 5)],
      { occurredAt: conversionAt },
      config,
    );
    expect(r).toEqual([{ touchpointId: 'b', weight: 1 }]);
  });
});

describe('linear', () => {
  it('splits credit equally and sums to 1', () => {
    const r = linearModel.calculate(
      [tp('a', 20), tp('b', 10), tp('c', 2)],
      { occurredAt: conversionAt },
      config,
    );
    expect(r.map((w) => w.weight)).toEqual([1 / 3, 1 / 3, 1 / 3]);
    expect(sum(r)).toBeCloseTo(1, 10);
  });
});

describe('position-based', () => {
  it('applies 40/40/20 with configured weights and sums to 1', () => {
    const r = positionBasedModel.calculate(
      [tp('a', 20), tp('b', 10), tp('c', 2)],
      { occurredAt: conversionAt },
      config,
    );
    const byId = Object.fromEntries(r.map((w) => [w.touchpointId, w.weight]));
    expect(byId.a).toBeCloseTo(0.4, 10);
    expect(byId.c).toBeCloseTo(0.4, 10);
    expect(byId.b).toBeCloseTo(0.2, 10);
    expect(sum(r)).toBeCloseTo(1, 10);
  });
  it('single touch gets 100%', () => {
    const r = positionBasedModel.calculate(
      [tp('a', 5)],
      { occurredAt: conversionAt },
      config,
    );
    expect(r).toEqual([{ touchpointId: 'a', weight: 1 }]);
  });
});

describe('time-decay', () => {
  it('gives more credit to recent touches and sums to 1', () => {
    const r = timeDecayModel.calculate(
      [tp('a', 14), tp('b', 0)],
      { occurredAt: conversionAt },
      config,
    );
    const byId = Object.fromEntries(r.map((w) => [w.touchpointId, w.weight]));
    expect(byId.b).toBeGreaterThan(byId.a);
    expect(sum(r)).toBeCloseTo(1, 10);
    // 14 days = 2 half-lives → a≈0.25 share of (0.25+1)
    expect(byId.a).toBeCloseTo(0.25 / 1.25, 6);
  });

  it('respects a configurable half-life', () => {
    const short = timeDecayModel.calculate(
      [tp('a', 7), tp('b', 0)],
      { occurredAt: conversionAt },
      { ...config, timeDecayHalfLifeDays: 7 },
    );
    const byId = Object.fromEntries(
      short.map((w) => [w.touchpointId, w.weight]),
    );
    // 7 days = 1 half-life → a=0.5 share of (0.5+1)
    expect(byId.a).toBeCloseTo(0.5 / 1.5, 6);
  });
});

describe('AttributionModelRegistry', () => {
  const registry = new AttributionModelRegistry();

  it('resolves every built-in model by name', () => {
    for (const name of [
      'first-touch',
      'last-touch',
      'linear',
      'position-based',
      'time-decay',
      'data-driven',
    ] as const) {
      expect(registry.get(name).name).toBe(name);
    }
  });

  it('data-driven falls back to linear distribution', () => {
    const dd = registry
      .get('data-driven')
      .calculate(
        [tp('a', 20), tp('b', 2)],
        { occurredAt: conversionAt },
        config,
      );
    expect(dd.map((w) => w.weight)).toEqual([0.5, 0.5]);
  });

  it('falls back to last-touch for an unknown model name', () => {
    expect(registry.get('nonsense' as never).name).toBe('last-touch');
  });

  it('supports registering a custom model', () => {
    registry.register({
      name: 'first-touch',
      supports: () => true,
      calculate: () => [],
    });
    expect(
      registry
        .get('first-touch')
        .calculate([tp('a', 1)], { occurredAt: conversionAt }, config),
    ).toEqual([]);
  });
});
