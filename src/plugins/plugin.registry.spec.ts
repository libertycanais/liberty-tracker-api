import type { CanonicalEvent } from '../contracts/canonical.types';
import { NoopIdentityResolver } from '../contracts/identity-resolver';
import { MapRegistry } from '../common/registry/registry';
import { PluginRegistry } from './plugin.registry';
import type { Plugin, PluginExecutionContext } from './plugin.types';

function canonicalEvent(
  overrides: Partial<CanonicalEvent> = {},
): CanonicalEvent {
  return {
    eventVersion: 1,
    origin: 'browser',
    eventId: 'evt-1',
    eventName: 'page_view',
    eventType: 'PAGE_VIEW',
    occurredAt: new Date('2026-07-07T12:00:00Z'),
    identity: { visitorId: 'v-1' },
    ...overrides,
  };
}

function fakePlugin(overrides: Partial<Plugin> = {}): Plugin {
  return {
    name: 'fake',
    priority: 100,
    enabled: true,
    supports: () => true,
    execute: (ctx: PluginExecutionContext) => Promise.resolve(void ctx),
    ...overrides,
  };
}

describe('MapRegistry (shared contract)', () => {
  it('supports register/unregister/get/list/clear', () => {
    const registry = new MapRegistry<string>();
    registry.register('a', 'A');
    registry.register('b', 'B');
    expect(registry.get('a')).toBe('A');
    expect(registry.list()).toEqual(['A', 'B']);
    registry.unregister('a');
    expect(registry.get('a')).toBeUndefined();
    registry.clear();
    expect(registry.list()).toEqual([]);
  });

  it('overwrites on duplicate key instead of duplicating', () => {
    const registry = new MapRegistry<string>();
    registry.register('a', 'A');
    registry.register('a', 'A2');
    expect(registry.list()).toEqual(['A2']);
  });
});

describe('PluginRegistry', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry();
  });

  it('is empty by default (no connectors in Sprint 4.1)', () => {
    expect(registry.list()).toEqual([]);
    expect(registry.resolveFor(canonicalEvent())).toEqual([]);
  });

  it('registers and retrieves plugins by name', () => {
    const plugin = fakePlugin({ name: 'meta-capi' });
    registry.register(plugin);
    expect(registry.get('meta-capi')).toBe(plugin);
    registry.unregister('meta-capi');
    expect(registry.get('meta-capi')).toBeUndefined();
  });

  it('resolveFor filters by enabled and supports, ordered by priority', () => {
    const first = fakePlugin({ name: 'first', priority: 10 });
    const second = fakePlugin({ name: 'second', priority: 20 });
    const disabled = fakePlugin({
      name: 'disabled',
      priority: 1,
      enabled: false,
    });
    const unsupported = fakePlugin({
      name: 'unsupported',
      priority: 1,
      supports: (e) => e.eventType === 'PURCHASE',
    });
    registry.register(second);
    registry.register(disabled);
    registry.register(first);
    registry.register(unsupported);

    const resolved = registry.resolveFor(canonicalEvent());
    expect(resolved.map((p) => p.name)).toEqual(['first', 'second']);
  });
});

describe('NoopIdentityResolver', () => {
  it('returns the identity unchanged', async () => {
    const resolver = new NoopIdentityResolver();
    const identity = { visitorId: 'v-1', anonymousId: 'a-1' };
    await expect(resolver.resolve(identity)).resolves.toEqual(identity);
  });
});
