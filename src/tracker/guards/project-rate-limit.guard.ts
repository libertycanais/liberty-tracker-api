import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Project } from '../../../generated/prisma/client';
import { ConfigurationService } from '../../config/configuration.service';
import { RedisService } from '../../redis/redis.service';
import { resolveTrackerConfig } from '../entities/tracker-config.entity';
import { RATE_LIMIT_WINDOW_SECONDS } from '../tracker.constants';
import { TrackerRepository } from '../tracker.repository';

@Injectable()
export class ProjectRateLimitGuard implements CanActivate {
  constructor(
    private readonly trackerRepository: TrackerRepository,
    private readonly redisService: RedisService,
    private readonly configurationService: ConfigurationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { project: Project }>();
    const project = request.project;

    const rawConfig = await this.trackerRepository.getTrackerConfig(project.id);
    const config = resolveTrackerConfig(
      rawConfig,
      this.configurationService.rateLimit.defaultProjectLimitPerMinute,
    );

    const windowKey = Math.floor(
      Date.now() / (RATE_LIMIT_WINDOW_SECONDS * 1000),
    );
    const redisKey = `lt:ratelimit:${project.id}:${windowKey}`;

    let count: number;
    try {
      const client = this.redisService.getClient();
      count = await client.incr(redisKey);
      if (count === 1) {
        await client.expire(redisKey, RATE_LIMIT_WINDOW_SECONDS);
      }
    } catch {
      // Fail-open: a secondary protection (rate limit) shouldn't block
      // ingestion just because its own backing store (Redis) is down —
      // same resilience philosophy as the rest of the Tracker Engine.
      return true;
    }

    if (count > config.rateLimitPerMinute) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: `Rate limit exceeded (${config.rateLimitPerMinute}/min for this project)`,
          retryAfterSeconds: RATE_LIMIT_WINDOW_SECONDS,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
