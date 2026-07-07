import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { ForwardStatus, Platform } from '../../generated/prisma/enums';
import { Prisma } from '../../generated/prisma/client';
import type { Event, Project } from '../../generated/prisma/client';
import { MetricsService } from '../observability/metrics/metrics.service';
import { PrismaService } from '../prisma/prisma.service';

export interface ForwardJobData {
  eventId: string;
  platform: Platform;
  correlationId?: string;
}

@Injectable()
export class ForwardingService {
  private readonly logger = new Logger(ForwardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metricsService: MetricsService,
    @InjectQueue('event-forwarding')
    private readonly queue: Queue<ForwardJobData>,
  ) {}

  async enqueueForwards(
    event: Event,
    project: Project,
    correlationId?: string,
  ): Promise<void> {
    const credentials = await this.prisma.platformCredential.findMany({
      where: { projectId: project.id, isActive: true },
    });

    for (const credential of credentials) {
      try {
        await this.prisma.eventForward.upsert({
          where: {
            eventId_platform: {
              eventId: event.id,
              platform: credential.platform,
            },
          },
          create: {
            eventId: event.id,
            platform: credential.platform,
            status: ForwardStatus.PENDING,
          },
          update: { status: ForwardStatus.PENDING, attempt: 0 },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          // Another concurrent request already created this EventForward
          // row (and therefore already enqueued its job) — skip re-adding.
          continue;
        }
        throw error;
      }

      try {
        await this.queue.add(
          'forward',
          { eventId: event.id, platform: credential.platform, correlationId },
          { attempts: 5, backoff: { type: 'exponential', delay: 2000 } },
        );
      } catch (error) {
        // The event itself is already durably persisted in Postgres at
        // this point — a BullMQ/Redis outage shouldn't fail the whole
        // ingestion request. The forward stays PENDING and needs manual
        // reconciliation (tracked as a known gap, see docs/TODO.md).
        this.metricsService.incrementQueueEnqueueFailures();
        this.logger.error(
          `Failed to enqueue forward job for event ${event.id} -> ${credential.platform}: ${(error as Error).message}`,
        );
      }
    }
  }
}
