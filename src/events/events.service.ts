import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EncryptionService } from '../crypto/encryption.service';
import { Prisma } from '../../generated/prisma/client';
import type { Event, Project } from '../../generated/prisma/client';
import {
  EventType,
  ForwardStatus,
  Platform,
} from '../../generated/prisma/enums';
import { DomainEventsService } from '../domain-events/domain-events.service';
import { ForwardingService } from '../forwarding/forwarding.service';
import { MetricsService } from '../observability/metrics/metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import { TrackerService } from '../tracker/tracker.service';
import { CreateEventDto } from './dto/create-event.dto';

const MAX_OCCURRED_AT_FUTURE_MS = 48 * 60 * 60 * 1000;
const MAX_OCCURRED_AT_PAST_MS = 90 * 24 * 60 * 60 * 1000;

export interface FindEventsFilters {
  eventType?: EventType;
  platform?: Platform;
  forwardStatus?: ForwardStatus;
}

interface RequestMeta {
  ip?: string;
  userAgent?: string;
  correlationId?: string;
}

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly forwardingService: ForwardingService,
    private readonly trackerService: TrackerService,
    private readonly metricsService: MetricsService,
    private readonly domainEvents: DomainEventsService,
  ) {}

  async createEvent(project: Project, dto: CreateEventDto, meta: RequestMeta) {
    const startedAt = Date.now();
    const result = await this.createEventInternal(project, dto, meta);
    this.metricsService.recordProcessingTime(Date.now() - startedAt);
    return result;
  }

  private async createEventInternal(
    project: Project,
    dto: CreateEventDto,
    meta: RequestMeta,
  ) {
    const decision = await this.trackerService.processIngestion(
      project,
      dto,
      meta.correlationId,
    );

    if (decision.kind === 'blocked') {
      return { status: 'ignored', reason: decision.reason };
    }

    if (decision.kind === 'heartbeat') {
      return {
        status: 'ok',
        visitorId: dto.visitorId,
        sessionId: decision.sessionId,
        isNewSession: decision.isNewSession,
      };
    }

    const eventId = dto.eventId ?? randomUUID();
    const occurredAt = this.resolveOccurredAt(dto.occurredAt);

    let event: Event;
    try {
      event = await this.prisma.event.upsert({
        where: { projectId_eventId: { projectId: project.id, eventId } },
        create: {
          projectId: project.id,
          visitorId: dto.visitorId,
          sessionId: decision.sessionId,
          eventName: dto.eventName,
          eventType: dto.eventType,
          eventId,
          occurredAt,
          sourceUrl: dto.sourceUrl,
          referrerUrl: dto.referrerUrl,
          utmSource: decision.attribution.utmSource,
          utmMedium: decision.attribution.utmMedium,
          utmCampaign: decision.attribution.utmCampaign,
          utmTerm: decision.attribution.utmTerm,
          utmContent: decision.attribution.utmContent,
          fbclid: decision.attribution.fbclid,
          gclid: decision.attribution.gclid,
          ip: meta.ip,
          userAgent: meta.userAgent,
          emailEncrypted: dto.email
            ? this.encryptionService.encrypt(dto.email)
            : undefined,
          phoneEncrypted: dto.phone
            ? this.encryptionService.encrypt(dto.phone)
            : undefined,
          externalId: dto.externalId,
          currency: dto.currency,
          value: dto.value,
          metadata: dto.metadata as never,
          isNewVisitor: decision.isNewVisitor,
          isNewSession: decision.isNewSession,
          sessionStartedAt: decision.sessionStartedAt,
        },
        update: {},
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Lost a race against a concurrent request carrying the same
        // eventId — the other request already persisted and forwarded
        // this event, so just return the same idempotent response
        // without enqueueing forwarding a second time.
        const existing = await this.prisma.event.findUniqueOrThrow({
          where: { projectId_eventId: { projectId: project.id, eventId } },
        });
        return {
          id: existing.id,
          eventId: existing.eventId,
          status: 'accepted',
          visitorId: existing.visitorId,
          sessionId: existing.sessionId,
          isNewVisitor: decision.isNewVisitor,
          isNewSession: decision.isNewSession,
        };
      }
      throw error;
    }

    this.domainEvents.publish('EventReceived', {
      correlationId: meta.correlationId ?? event.id,
      projectId: project.id,
      eventId: event.eventId,
      eventType: event.eventType,
      eventName: event.eventName,
    });

    await this.forwardingService.enqueueForwards(
      event,
      project,
      meta.correlationId,
    );
    this.metricsService.incrementEventsIngested();

    return {
      id: event.id,
      eventId: event.eventId,
      status: 'accepted',
      visitorId: event.visitorId,
      sessionId: event.sessionId,
      isNewVisitor: decision.isNewVisitor,
      isNewSession: decision.isNewSession,
    };
  }

  private resolveOccurredAt(raw: string | undefined): Date {
    if (!raw) return new Date();
    const parsed = new Date(raw);
    const now = Date.now();
    if (
      parsed.getTime() > now + MAX_OCCURRED_AT_FUTURE_MS ||
      parsed.getTime() < now - MAX_OCCURRED_AT_PAST_MS
    ) {
      throw new BadRequestException(
        'occurredAt is too far in the future or too far in the past',
      );
    }
    return parsed;
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
