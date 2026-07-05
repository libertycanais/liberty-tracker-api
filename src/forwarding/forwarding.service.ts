import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { ForwardStatus, Platform } from '../../generated/prisma/enums';
import type { Event, Project } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface ForwardJobData {
  eventId: string;
  platform: Platform;
}

@Injectable()
export class ForwardingService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('event-forwarding')
    private readonly queue: Queue<ForwardJobData>,
  ) {}

  async enqueueForwards(event: Event, project: Project): Promise<void> {
    const credentials = await this.prisma.platformCredential.findMany({
      where: { projectId: project.id, isActive: true },
    });

    for (const credential of credentials) {
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

      await this.queue.add(
        'forward',
        { eventId: event.id, platform: credential.platform },
        { attempts: 5, backoff: { type: 'exponential', delay: 2000 } },
      );
    }
  }
}
