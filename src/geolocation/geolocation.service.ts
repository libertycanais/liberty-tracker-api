import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync } from 'fs';
import type { CityResponse, Reader } from 'maxmind';
import { open } from 'maxmind';
import { RedisService } from '../redis/redis.service';
import type { GeoContext, GeoProvider, GeoResult } from './geolocation.types';

const GEO_CACHE_PREFIX = 'lt:geo:';

/**
 * Geo resolution chain (Sprint 4.1):
 *   Cloudflare headers → Redis cache → GeoLite2 (.mmdb) → null.
 *
 * Every step degrades gracefully — geo is enrichment, never a reason to
 * fail ingestion. Without a .mmdb on disk (this dev environment) the chain
 * simply ends in null (structure-ready). Extra providers register via
 * `registerProvider()` (GeoProvider interface) without touching the chain.
 */
@Injectable()
export class GeolocationService implements OnModuleInit {
  private readonly logger = new Logger(GeolocationService.name);
  private reader: Reader<CityResponse> | null = null;
  private readonly enabled: boolean;
  private readonly dbPath: string | undefined;
  private readonly cacheTtl: number;
  private readonly providers: GeoProvider[] = [];

  constructor(
    configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    this.enabled = configService.get<boolean>('GEOIP_ENABLED', true);
    this.dbPath = configService.get<string>('GEOIP_DB_PATH');
    this.cacheTtl = configService.get<number>('GEOIP_CACHE_TTL_SECONDS', 86400);
  }

  async onModuleInit() {
    if (!this.enabled || !this.dbPath) return;
    if (!existsSync(this.dbPath)) {
      this.logger.warn(
        `GEOIP_DB_PATH set but file not found (${this.dbPath}) — GeoLite2 lookups disabled, chain degrades to Cloudflare/null`,
      );
      return;
    }
    try {
      this.reader = await open<CityResponse>(this.dbPath);
      this.logger.log(`GeoLite2 database loaded from ${this.dbPath}`);
    } catch (error) {
      this.logger.error(
        `Failed to open GeoLite2 database: ${(error as Error).message}`,
      );
    }
  }

  /** Future providers (MaxMind Enterprise, IPInfo, ...) plug in here. */
  registerProvider(provider: GeoProvider): void {
    this.providers.push(provider);
  }

  async resolve(context: GeoContext): Promise<GeoResult | null> {
    if (!this.enabled) return null;
    try {
      // 1. Cloudflare headers — free and authoritative when behind CF.
      const fromCf = this.fromCloudflare(context);
      const ip = context.cfConnectingIp ?? context.ip;
      if (!ip) return fromCf;

      // 2. Redis cache
      const cached = await this.cacheGet(ip);
      if (cached) return { ...cached, ...fromCf };

      // 3. GeoLite2
      const fromDb = this.fromGeoLite(ip);
      if (fromDb) {
        await this.cacheSet(ip, fromDb);
        return { ...fromDb, ...fromCf };
      }

      // 3b. registered external providers (none in this sprint)
      for (const provider of this.providers) {
        const result = await provider.resolve(context);
        if (result) {
          await this.cacheSet(ip, result);
          return { ...result, ...fromCf };
        }
      }

      // 4. fallback
      return fromCf;
    } catch (error) {
      this.logger.error(`Geo resolve degraded: ${(error as Error).message}`);
      return null;
    }
  }

  private fromCloudflare(context: GeoContext): GeoResult | null {
    const headers = context.headers ?? {};
    const cfCountry =
      context.cfCountry ??
      (headers['cf-ipcountry'] as string | undefined) ??
      undefined;
    if (!cfCountry || cfCountry === 'XX') return null;
    return { countryCode: cfCountry };
  }

  private fromGeoLite(ip: string): GeoResult | null {
    if (!this.reader) return null;
    try {
      const hit = this.reader.get(ip);
      if (!hit) return null;
      return {
        country: hit.country?.names?.en,
        countryCode: hit.country?.iso_code,
        region: hit.subdivisions?.[0]?.names?.en,
        state: hit.subdivisions?.[0]?.iso_code,
        city: hit.city?.names?.en,
        timezone: hit.location?.time_zone,
        latitude: hit.location?.latitude,
        longitude: hit.location?.longitude,
        ipVersion: ip.includes(':') ? 6 : 4,
      };
    } catch {
      return null;
    }
  }

  private async cacheGet(ip: string): Promise<GeoResult | null> {
    try {
      const raw = await this.redisService
        .getClient()
        .get(GEO_CACHE_PREFIX + ip);
      return raw ? (JSON.parse(raw) as GeoResult) : null;
    } catch {
      return null;
    }
  }

  private async cacheSet(ip: string, result: GeoResult): Promise<void> {
    try {
      await this.redisService
        .getClient()
        .set(
          GEO_CACHE_PREFIX + ip,
          JSON.stringify(result),
          'EX',
          this.cacheTtl,
        );
    } catch {
      /* cache failures never propagate */
    }
  }
}
