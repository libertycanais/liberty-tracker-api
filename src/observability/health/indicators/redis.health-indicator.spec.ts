import type { HealthIndicatorService } from '@nestjs/terminus';
import { RedisService } from '../../../redis/redis.service';
import { RedisHealthIndicator } from './redis.health-indicator';

describe('RedisHealthIndicator', () => {
  let up: jest.Mock;
  let down: jest.Mock;
  let healthIndicatorService: jest.Mocked<HealthIndicatorService>;
  let redisService: jest.Mocked<RedisService>;
  let indicator: RedisHealthIndicator;

  beforeEach(() => {
    up = jest.fn().mockReturnValue({ redis: { status: 'up' } });
    down = jest.fn().mockReturnValue({ redis: { status: 'down' } });
    healthIndicatorService = {
      check: jest.fn().mockReturnValue({ up, down }),
    };
    redisService = { ping: jest.fn() } as unknown as jest.Mocked<RedisService>;
    indicator = new RedisHealthIndicator(healthIndicatorService, redisService);
  });

  it('reports up when PING succeeds', async () => {
    redisService.ping.mockResolvedValue(true);
    await indicator.pingCheck('redis');
    expect(up).toHaveBeenCalled();
    expect(down).not.toHaveBeenCalled();
  });

  it('reports down when PING returns an unexpected reply', async () => {
    redisService.ping.mockResolvedValue(false);
    await indicator.pingCheck('redis');
    expect(down).toHaveBeenCalledWith({ message: 'Unexpected PING reply' });
  });

  it('reports down instead of throwing when the connection fails', async () => {
    redisService.ping.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(indicator.pingCheck('redis')).resolves.toBeDefined();
    expect(down).toHaveBeenCalledWith({ message: 'ECONNREFUSED' });
  });
});
