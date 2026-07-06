import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EncryptionService } from '../crypto/encryption.service';
import type { Prisma, Project } from '../../generated/prisma/client';
import {
  EventType,
  ForwardStatus,
  Platform,
} from '../../generated/prisma/enums';
import { ForwardingService } from '../forwarding/forwarding.service';
import { PrismaService } from '../prisma/prisma.service';
import { TrackerService } from '../tracker/tracker.service';
import { CreateEventDto } from './dto/create-event.dto';

export interface FindEventsFilters {
  eventType?: EventType;
  platform?: Platform;
  forwardStatus?: ForwardStatus;
}

interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly forwardingService: ForwardingService,
    private readonly trackerService: TrackerService,
  ) {}

  async createEvent(project: Project, dto: CreateEventDto, meta: RequestMeta) {
    const decision = await this.trackerService.processIngestion(project, dto);

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
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();

    const event = await this.prisma.event.upsert({
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

    await this.forwardingService.enqueueForwards(event, project);

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
