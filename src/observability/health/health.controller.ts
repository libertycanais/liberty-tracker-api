import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { PrismaService } from '../../prisma/prisma.service';
import { BullMQHealthIndicator } from './indicators/bullmq.health-indicator';
import { RedisHealthIndicator } from './indicators/redis.health-indicator';

const MEMORY_HEAP_THRESHOLD_BYTES = 300 * 1024 * 1024;
const MEMORY_RSS_THRESHOLD_BYTES = 300 * 1024 * 1024;

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaIndicator: PrismaHealthIndicator,
    private readonly redisIndicator: RedisHealthIndicator,
    private readonly bullmqIndicator: BullMQHealthIndicator,
    private readonly memoryIndicator: MemoryHealthIndicator,
    private readonly prisma: PrismaService,
  ) {}

  @ApiOperation({
    summary: 'Full health check: Postgres, Redis, BullMQ, memory, uptime',
  })
  @Get()
  @HealthCheck()
  async check() {
    return this.withMeta(() =>
      this.health.check([
        () => this.prismaIndicator.pingCheck('postgres', this.prisma),
        () => this.redisIndicator.pingCheck('redis'),
        () => this.bullmqIndicator.pingCheck('bullmq'),
        () =>
          this.memoryIndicator.checkHeap(
            'memory_heap',
            MEMORY_HEAP_THRESHOLD_BYTES,
          ),
        () =>
          this.memoryIndicator.checkRSS(
            'memory_rss',
            MEMORY_RSS_THRESHOLD_BYTES,
          ),
      ]),
    );
  }

  @ApiOperation({
    summary:
      'Liveness probe — confirms the process itself is responsive, no external dependencies',
  })
  @Get('live')
  @HealthCheck()
  async live() {
    return this.withMeta(() => this.health.check([]));
  }

  @ApiOperation({
    summary:
      'Readiness probe — confirms Postgres/Redis/BullMQ are reachable before routing traffic',
  })
  @Get('ready')
  @HealthCheck()
  async ready() {
    return this.withMeta(() =>
      this.health.check([
        () => this.prismaIndicator.pingCheck('postgres', this.prisma),
        () => this.redisIndicator.pingCheck('redis'),
        () => this.bullmqIndicator.pingCheck('bullmq'),
      ]),
    );
  }

  private async withMeta<T extends Record<string, unknown>>(
    run: () => Promise<T>,
  ) {
    const start = Date.now();
    const meta = () => ({
      uptimeSeconds: Math.round(process.uptime()),
      responseTimeMs: Date.now() - start,
    });
    try {
      const result = await run();
      return { ...result, ...meta() };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        const body = error.getResponse();
        const enriched =
          typeof body === 'object' && body !== null
            ? { ...body, ...meta() }
            : { message: body, ...meta() };
        throw new ServiceUnavailableException(enriched);
      }
      throw error;
    }
  }
}
