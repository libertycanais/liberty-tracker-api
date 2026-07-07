import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { TrackerRepository } from './tracker.repository';

describe('TrackerRepository — Redis failure fallback', () => {
  let hgetall: jest.Mock;
  let hset: jest.Mock;
  let expireMock: jest.Mock;
  let repository: TrackerRepository;

  beforeEach(() => {
    hgetall = jest.fn();
    hset = jest.fn();
    expireMock = jest.fn();
    const redisService = {
      getClient: () => ({ hgetall, hset, expire: expireMock, del: jest.fn() }),
    } as unknown as RedisService;
    const prisma = {} as unknown as PrismaService;
    repository = new TrackerRepository(redisService, prisma);
  });

  it('returns the hash when Redis responds normally', async () => {
    hgetall.mockResolvedValue({ firstSeenAt: '2026-01-01T00:00:00.000Z' });
    const result = await repository.getVisitorHash('project-1', 'visitor-1');
    expect(result).toEqual({ firstSeenAt: '2026-01-01T00:00:00.000Z' });
  });

  it('returns null (cache-miss shape) instead of throwing when Redis is down on read', async () => {
    hgetall.mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await repository.getVisitorHash('project-1', 'visitor-1');
    expect(result).toBeNull();
  });

  it('resolves silently instead of throwing when Redis is down on write', async () => {
    hset.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(
      repository.setVisitorHash('project-1', 'visitor-1', { sessionCount: 0 }),
    ).resolves.toBeUndefined();
  });

  it('treats an empty hash as a cache miss (null), not an empty object', async () => {
    hgetall.mockResolvedValue({});
    const result = await repository.getSessionHash('project-1', 'session-1');
    expect(result).toBeNull();
  });
});
