import { HttpException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { ConfigurationService } from '../../config/configuration.service';
import { RedisService } from '../../redis/redis.service';
import { TrackerRepository } from '../tracker.repository';
import { ProjectRateLimitGuard } from './project-rate-limit.guard';

function makeContext(project: { id: string }): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ project }),
    }),
  } as unknown as ExecutionContext;
}

describe('ProjectRateLimitGuard', () => {
  let trackerRepository: jest.Mocked<TrackerRepository>;
  let redisService: jest.Mocked<RedisService>;
  let configurationService: jest.Mocked<ConfigurationService>;
  let guard: ProjectRateLimitGuard;
  let incr: jest.Mock;
  let expire: jest.Mock;

  beforeEach(() => {
    incr = jest.fn();
    expire = jest.fn();
    trackerRepository = {
      getTrackerConfig: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<TrackerRepository>;
    redisService = {
      getClient: jest.fn().mockReturnValue({ incr, expire }),
    } as unknown as jest.Mocked<RedisService>;
    configurationService = {
      rateLimit: { defaultProjectLimitPerMinute: 3 },
    } as unknown as jest.Mocked<ConfigurationService>;

    guard = new ProjectRateLimitGuard(
      trackerRepository,
      redisService,
      configurationService,
    );
  });

  it('allows the request when under the limit', async () => {
    incr.mockResolvedValue(1);
    await expect(
      guard.canActivate(makeContext({ id: 'project-1' })),
    ).resolves.toBe(true);
    expect(expire).toHaveBeenCalledWith(expect.any(String), 60);
  });

  it('only sets the TTL on the first request in a window', async () => {
    incr.mockResolvedValue(2);
    await guard.canActivate(makeContext({ id: 'project-1' }));
    expect(expire).not.toHaveBeenCalled();
  });

  it('throws 429 once the per-project limit is exceeded', async () => {
    incr.mockResolvedValue(4);
    await expect(
      guard.canActivate(makeContext({ id: 'project-1' })),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('uses the project-specific rateLimitPerMinute when configured', async () => {
    trackerRepository.getTrackerConfig.mockResolvedValue({
      rateLimitPerMinute: 10,
    });
    incr.mockResolvedValue(5);
    await expect(
      guard.canActivate(makeContext({ id: 'project-1' })),
    ).resolves.toBe(true);
  });

  it('fails open when Redis is unavailable', async () => {
    incr.mockRejectedValue(new Error('connection refused'));
    await expect(
      guard.canActivate(makeContext({ id: 'project-1' })),
    ).resolves.toBe(true);
  });
});
