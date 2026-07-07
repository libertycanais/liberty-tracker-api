import { Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { Project } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import {
  ATTRIBUTION_TTL_SECONDS,
  TRACKER_REDIS_KEY_PREFIX,
  VISITOR_TTL_SECONDS,
} from './tracker.constants';
import type { TrackerConfig } from './tracker.types';

@Injectable()
export class TrackerRepository {
  private readonly logger = new Logger(TrackerRepository.name);
  private readonly redis: Redis;

  constructor(
    redisService: RedisService,
    private readonly prisma: PrismaService,
  ) {
    this.redis = redisService.getClient();
  }

  /**
   * Redis is enrichment infrastructure, not a source of truth — if it's
   * unavailable, ingestion should degrade (treated as a cache miss) rather
   * than fail the whole request. Every public Redis-backed method below
   * routes through this so a Redis outage never surfaces as a 500.
   */
  private async safeRedis<T>(
    operation: string,
    fn: () => Promise<T>,
    fallback: T,
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      this.logger.error(
        `Redis operation "${operation}" failed, falling back: ${(error as Error).message}`,
      );
      return fallback;
    }
  }

  private visitorKey(projectId: string, visitorId: string): string {
    return `${TRACKER_REDIS_KEY_PREFIX}:visitor:${projectId}:${visitorId}`;
  }

  private sessionKey(projectId: string, sessionId: string): string {
    return `${TRACKER_REDIS_KEY_PREFIX}:session:${projectId}:${sessionId}`;
  }

  private attributionKey(projectId: string, visitorId: string): string {
    return `${TRACKER_REDIS_KEY_PREFIX}:attribution:${projectId}:${visitorId}`;
  }

  async getVisitorHash(
    projectId: string,
    visitorId: string,
  ): Promise<Record<string, string> | null> {
    return this.safeRedis(
      'getVisitorHash',
      async () => {
        const data = await this.redis.hgetall(
          this.visitorKey(projectId, visitorId),
        );
        return Object.keys(data).length > 0 ? data : null;
      },
      null,
    );
  }

  async setVisitorHash(
    projectId: string,
    visitorId: string,
    fields: Record<string, string | number>,
  ): Promise<void> {
    return this.safeRedis(
      'setVisitorHash',
      async () => {
        const key = this.visitorKey(projectId, visitorId);
        await this.redis.hset(key, fields);
        await this.redis.expire(key, VISITOR_TTL_SECONDS);
      },
      undefined,
    );
  }

  async getSessionHash(
    projectId: string,
    sessionId: string,
  ): Promise<Record<string, string> | null> {
    return this.safeRedis(
      'getSessionHash',
      async () => {
        const data = await this.redis.hgetall(
          this.sessionKey(projectId, sessionId),
        );
        return Object.keys(data).length > 0 ? data : null;
      },
      null,
    );
  }

  async setSessionHash(
    projectId: string,
    sessionId: string,
    fields: Record<string, string>,
    ttlSeconds: number,
  ): Promise<void> {
    return this.safeRedis(
      'setSessionHash',
      async () => {
        const key = this.sessionKey(projectId, sessionId);
        await this.redis.hset(key, fields);
        await this.redis.expire(key, ttlSeconds);
      },
      undefined,
    );
  }

  async touchSessionTtl(
    projectId: string,
    sessionId: string,
    ttlSeconds: number,
  ): Promise<void> {
    return this.safeRedis(
      'touchSessionTtl',
      async () => {
        await this.redis.expire(
          this.sessionKey(projectId, sessionId),
          ttlSeconds,
        );
      },
      undefined,
    );
  }

  async getAttribution(
    projectId: string,
    visitorId: string,
  ): Promise<Record<string, string> | null> {
    return this.safeRedis(
      'getAttribution',
      async () => {
        const data = await this.redis.hgetall(
          this.attributionKey(projectId, visitorId),
        );
        return Object.keys(data).length > 0 ? data : null;
      },
      null,
    );
  }

  async setAttribution(
    projectId: string,
    visitorId: string,
    fields: Record<string, string>,
  ): Promise<void> {
    return this.safeRedis(
      'setAttribution',
      async () => {
        const key = this.attributionKey(projectId, visitorId);
        await this.redis.del(key);
        if (Object.keys(fields).length > 0) {
          await this.redis.hset(key, fields);
        }
        await this.redis.expire(key, ATTRIBUTION_TTL_SECONDS);
      },
      undefined,
    );
  }

  async getTrackerConfig(projectId: string): Promise<TrackerConfig | null> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { trackerConfig: true },
    });
    return (project?.trackerConfig as TrackerConfig | null) ?? null;
  }

  async updateTrackerConfig(
    projectId: string,
    config: TrackerConfig,
  ): Promise<Project> {
    return this.prisma.project.update({
      where: { id: projectId },
      data: { trackerConfig: config as never },
    });
  }
}
