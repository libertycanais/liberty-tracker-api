import type { CanonicalGeo } from '../contracts/canonical.types';

/**
 * Everything a provider may use to resolve geo — not just the IP
 * (refinement: Cloudflare already tells us the country via headers).
 */
export interface GeoContext {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
  cfCountry?: string;
  cfConnectingIp?: string;
  cfRay?: string;
}

export type GeoResult = CanonicalGeo;

/**
 * Extension point for future providers (MaxMind Enterprise, IPInfo,
 * IP2Location, Cloudflare Radar). Only the GeoLite2 reader is implemented
 * in this sprint; register alternatives here without touching the service.
 */
export interface GeoProvider {
  readonly name: string;
  resolve(context: GeoContext): Promise<GeoResult | null>;
}
