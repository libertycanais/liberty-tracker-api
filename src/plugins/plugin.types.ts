import type { CanonicalEvent } from '../contracts/canonical.types';

/**
 * Plugin Architecture (Sprint 4.1) — FOUNDATION ONLY.
 *
 * No real plugins exist in this sprint (Meta/Google/GA4/TikTok/... are
 * Sprint 5+). Future connectors implement this middleware-style interface
 * and register in the PluginRegistry; the ingestion pipeline never changes.
 * Plugins never transform payloads directly — they use an EventTransformer.
 */
export interface PluginExecutionContext {
  event: CanonicalEvent;
  projectId: string;
  correlationId?: string;
}

export interface Plugin {
  readonly name: string;
  /** Ordering among plugins (lower runs first). */
  readonly priority: number;
  /** Kill-switch without unregistering. */
  enabled: boolean;
  /** Each plugin decides whether it acts on a given event. */
  supports(event: CanonicalEvent): boolean;
  execute(ctx: PluginExecutionContext): Promise<void>;
}

/**
 * Transformation Layer (Ad.4): a canonical event is converted to a
 * platform-specific payload by a Transformer, never inside the plugin.
 */
export interface EventTransformer<TPlatformEvent = unknown> {
  readonly name: string;
  transform(event: CanonicalEvent): TPlatformEvent;
}
