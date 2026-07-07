import type { ConfigService } from '@nestjs/config';
import type { RedisService } from '../redis/redis.service';
import { GeolocationService } from './geolocation.service';

function makeService(opts: {
  enabled?: boolean;
  dbPath?: string;
  redisGet?: jest.Mock;
  redisSet?: jest.Mock;
}) {
  const configService = {
    get: jest.fn((key: string, fallback?: unknown) => {
      if (key === 'GEOIP_ENABLED') return opts.enabled ?? true;
      if (key === 'GEOIP_DB_PATH') return opts.dbPath;
      if (key === 'GEOIP_CACHE_TTL_SECONDS') return 60;
      return fallback;
    }),
  } as unknown as ConfigService;
  const redisGet = opts.redisGet ?? jest.fn().mockResolvedValue(null);
  const redisSet = opts.redisSet ?? jest.fn().mockResolvedValue('OK');
  const redisService = {
    getClient: () => ({ get: redisGet, set: redisSet }),
  } as unknown as RedisService;
  return {
    service: new GeolocationService(configService, redisService),
    redisGet,
    redisSet,
  };
}

describe('GeolocationService', () => {
  it('resolves country from Cloudflare headers without any DB', async () => {
    const { service } = makeService({});
    const result = await service.resolve({
      ip: '1.2.3.4',
      headers: { 'cf-ipcountry': 'BR' },
    });
    expect(result).toEqual({ countryCode: 'BR' });
  });

  it('ignores the Cloudflare XX (unknown) marker', async () => {
    const { service } = makeService({});
    const result = await service.resolve({
      ip: '1.2.3.4',
      headers: { 'cf-ipcountry': 'XX' },
    });
    expect(result).toBeNull();
  });

  it('returns the Redis-cached result on a cache hit', async () => {
    const cached = { country: 'Brazil', countryCode: 'BR', city: 'São Paulo' };
    const { service } = makeService({
      redisGet: jest.fn().mockResolvedValue(JSON.stringify(cached)),
    });
    const result = await service.resolve({ ip: '8.8.8.8' });
    expect(result).toEqual(cached);
  });

  it('falls back to null without .mmdb, cache miss and no CF headers (structure-ready)', async () => {
    const { service } = makeService({});
    await service.onModuleInit();
    const result = await service.resolve({ ip: '9.9.9.9' });
    expect(result).toBeNull();
  });

  it('does not resolve at all when GEOIP_ENABLED=false', async () => {
    const { service, redisGet } = makeService({ enabled: false });
    const result = await service.resolve({
      ip: '1.2.3.4',
      headers: { 'cf-ipcountry': 'BR' },
    });
    expect(result).toBeNull();
    expect(redisGet).not.toHaveBeenCalled();
  });

  it('survives a broken GEOIP_DB_PATH without throwing (degrades)', async () => {
    const { service } = makeService({ dbPath: 'Z:/nonexistent/geo.mmdb' });
    await expect(service.onModuleInit()).resolves.toBeUndefined();
    const result = await service.resolve({ ip: '9.9.9.9' });
    expect(result).toBeNull();
  });

  it('degrades to Cloudflare data when Redis errors', async () => {
    const { service } = makeService({
      redisGet: jest.fn().mockRejectedValue(new Error('redis down')),
    });
    const result = await service.resolve({
      ip: '1.2.3.4',
      headers: { 'cf-ipcountry': 'US' },
    });
    expect(result).toEqual({ countryCode: 'US' });
  });

  it('consults registered GeoProviders after the built-in chain', async () => {
    const { service } = makeService({});
    service.registerProvider({
      name: 'fake-provider',
      resolve: jest
        .fn()
        .mockResolvedValue({ countryCode: 'DE', city: 'Berlin' }),
    });
    const result = await service.resolve({ ip: '5.5.5.5' });
    expect(result).toEqual({ countryCode: 'DE', city: 'Berlin' });
  });
});
