import { InjectQueue } from '@nestjs/bullmq';
import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Queue } from 'bullmq';
import { MetricsService } from './metrics.service';

@ApiTags('metrics')
@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metricsService: MetricsService,
    @InjectQueue('event-forwarding') private readonly queue: Queue,
  ) {}

  @ApiOperation({
    summary:
      'Snapshot JSON de métricas da aplicação (contadores, taxas, médias, fila)',
  })
  @Get()
  async get() {
    const snapshot = this.metricsService.snapshot();
    let queueDepth: Record<string, number> | null = null;
    try {
      queueDepth = await this.queue.getJobCounts();
    } catch {
      // queue metrics degrade to null when Redis is unavailable
    }
    return { ...snapshot, queue: queueDepth };
  }
}
