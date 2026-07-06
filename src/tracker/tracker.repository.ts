import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { Project } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ATTRIBUTION_TTL_SECONDS,
  TRACKER_REDIS_KEY_PREFIX,
  VISITOR_TTL_SECONDS,
} from './tracker.constants';
import type { TrackerConfig } from './tracker.types';

@Injectable()
export class TrackerRepository implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.redis = new Redis(configService.getOrThrow<string>('REDIS_URL'), {
      lazyConnect: false,
    });
  }

  onModuleDestroy() {
    this.redis.disconnect();
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
    const data = await this.redis.hgetall(
      this.visitorKey(projectId, visitorId),
    );
    return Object.keys(data).length > 0 ? data : null;
  }

  async setVisitorHash(
    projectId: string,
    visitorId: string,
    fields: Record<string, string | number>,
  ): Promise<void> {
    const key = this.visitorKey(projectId, visitorId);
    await this.redis.hset(key, fields);
    await this.redis.expire(key, VISITOR_TTL_SECONDS);
  }

  async getSessionHash(
    projectId: string,
    sessionId: string,
  ): Promise<Record<string, string> | null> {
    const data = await this.redis.hgetall(
      this.sessionKey(projectId, sessionId),
    );
    return Object.keys(data).length > 0 ? data : null;
  }

  async setSessionHash(
    projectId: string,
    sessionId: string,
    fields: Record<string, string>,
    ttlSeconds: number,
  ): Promise<void> {
    const key = this.sessionKey(projectId, sessionId);
    await this.redis.hset(key, fields);
    await this.redis.expire(key, ttlSeconds);
  }

  async touchSessionTtl(
    projectId: string,
    sessionId: string,
    ttlSeconds: number,
  ): Promise<void> {
    await this.redis.expire(this.sessionKey(projectId, sessionId), ttlSeconds);
  }

  async getAttribution(
    projectId: string,
    visitorId: string,
  ): Promise<Record<string, string> | null> {
    const data = await this.redis.hgetall(
      this.attributionKey(projectId, visitorId),
    );
    return Object.keys(data).length > 0 ? data : null;
  }

  async setAttribution(
    projectId: string,
    visitorId: string,
    fields: Record<string, string>,
  ): Promise<void> {
    const key = this.attributionKey(projectId, visitorId);
    await this.redis.del(key);
    if (Object.keys(fields).length > 0) {
      await this.redis.hset(key, fields);
    }
    await this.redis.expire(key, ATTRIBUTION_TTL_SECONDS);
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
