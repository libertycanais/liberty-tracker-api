import { Injectable, NotFoundException } from '@nestjs/common';
import { EncryptionService } from '../crypto/encryption.service';
import { Prisma } from '../../generated/prisma/client';
import type { Project } from '../../generated/prisma/client';
import {
  EventType,
  ForwardStatus,
  Platform,
} from '../../generated/prisma/enums';
import { MetricsService } from '../observability/metrics/metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { EventPipelineService } from './pipeline/event-pipeline.service';
import type { PipelineRequestMeta } from './pipeline/pipeline.types';

export interface FindEventsFilters {
  eventType?: EventType;
  platform?: Platform;
  forwardStatus?: ForwardStatus;
}

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly pipeline: EventPipelineService,
    private readonly metricsService: MetricsService,
  ) {}

  /**
   * Single ingestion entrypoint — now orchestrated by the Event Pipeline
   * (Validate → Normalize → Enrich → Persist → EmitDomainEvents → Forward →
   * Metrics). Structural refactor only: responses, short-circuits and errors
   * are identical to the pre-pipeline implementation.
   */
  async createEvent(
    project: Project,
    dto: CreateEventDto,
    meta: PipelineRequestMeta,
  ) {
    const startedAt = Date.now();
    const result = await this.pipeline.run(project, dto, meta);
    this.metricsService.recordProcessingTime(Date.now() - startedAt);
    return result;
  }

  /** Batch ingestion: N events, same pipeline, one response per event. */
  async createEvents(
    project: Project,
    dtos: CreateEventDto[],
    meta: PipelineRequestMeta,
  ) {
    const results = [] as Record<string, unknown>[];
    for (const dto of dtos) {
      results.push(await this.createEvent(project, dto, meta));
    }
    return { count: results.length, results };
  }

  async findForProject(
    workspaceId: string,
    projectId: string,
    page: number,
    pageSize: number,
    filters: FindEventsFilters = {},
  ) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, workspaceId },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const where: Prisma.EventWhereInput = { projectId };
    if (filters.eventType) {
      where.eventType = filters.eventType;
    }
    if (filters.platform) {
      where.forwards = {
        some: {
          platform: filters.platform,
          ...(filters.forwardStatus ? { status: filters.forwardStatus } : {}),
        },
      };
    }

    const [events, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { forwards: true },
      }),
      this.prisma.event.count({ where }),
    ]);

    return {
      total,
      page,
      pageSize,
      events: events.map((event) => ({
        ...event,
        email: event.emailEncrypted
          ? this.encryptionService.decrypt(event.emailEncrypted)
          : null,
        phone: event.phoneEncrypted
          ? this.encryptionService.decrypt(event.phoneEncrypted)
          : null,
        emailEncrypted: undefined,
        phoneEncrypted: undefined,
      })),
    };
  }
}
