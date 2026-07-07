import { Injectable } from '@nestjs/common';
import type { CanonicalEvent } from '../contracts/canonical.types';
import { MapRegistry } from '../common/registry/registry';
import type { Plugin } from './plugin.types';

/**
 * Registry for platform plugins (standard register/unregister/get/list/clear
 * contract — refinement 18). Empty in this sprint; Sprint 5 connectors
 * register here without touching the pipeline.
 */
@Injectable()
export class PluginRegistry {
  private readonly registry = new MapRegistry<Plugin>();

  register(plugin: Plugin): void {
    this.registry.register(plugin.name, plugin);
  }

  unregister(name: string): void {
    this.registry.unregister(name);
  }

  get(name: string): Plugin | undefined {
    return this.registry.get(name);
  }

  list(): Plugin[] {
    return this.registry.list();
  }

  clear(): void {
    this.registry.clear();
  }

  /** Enabled plugins that support the event, ordered by priority. */
  resolveFor(event: CanonicalEvent): Plugin[] {
    return this.registry
      .list()
      .filter((p) => p.enabled && p.supports(event))
      .sort((a, b) => a.priority - b.priority);
  }
}
