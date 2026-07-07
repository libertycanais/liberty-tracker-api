import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { HealthIndicatorResult } from '@nestjs/terminus';
import { HealthIndicatorService } from '@nestjs/terminus';
import type { Queue } from 'bullmq';

@Injectable()
export class BullMQHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    @InjectQueue('event-forwarding') private readonly queue: Queue,
  ) {}

  async pingCheck<Key extends string>(
    key: Key,
  ): Promise<HealthIndicatorResult<Key>> {
    const indicator = this.healthIndicatorService.check(key);
    try {
      const jobCounts = await this.queue.getJobCounts();
      return indicator.up({ jobCounts });
    } catch (error) {
      return indicator.down({ message: (error as Error).message });
    }
  }
}
