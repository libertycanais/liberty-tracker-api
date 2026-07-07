import type { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

const mockPing = jest.fn();
const mockDisconnect = jest.fn();

jest.mock('ioredis', () => ({
  Redis: jest.fn().mockImplementation(() => ({
    ping: mockPing,
    disconnect: mockDisconnect,
  })),
}));

describe('RedisService', () => {
  let configService: jest.Mocked<ConfigService>;
  let service: RedisService;

  beforeEach(() => {
    jest.clearAllMocks();
    configService = {
      getOrThrow: jest.fn().mockReturnValue('redis://localhost:6379'),
    } as unknown as jest.Mocked<ConfigService>;
    service = new RedisService(configService);
  });

  it('creates the underlying client from REDIS_URL', () => {
    expect(configService.getOrThrow).toHaveBeenCalledWith('REDIS_URL');
  });

  it('getClient() returns the same underlying client on every call', () => {
    expect(service.getClient()).toBe(service.getClient());
  });

  it('ping() returns true when the client replies PONG', async () => {
    mockPing.mockResolvedValue('PONG');
    await expect(service.ping()).resolves.toBe(true);
  });

  it('ping() returns false for any other reply', async () => {
    mockPing.mockResolvedValue('WEIRD');
    await expect(service.ping()).resolves.toBe(false);
  });

  it('disconnects the client on module destroy', () => {
    service.onModuleDestroy();
    expect(mockDisconnect).toHaveBeenCalled();
  });
});
