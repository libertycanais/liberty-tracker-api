import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { Touchpoint, Visitor } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CanonicalCampaign,
  CanonicalGeo,
} from '../contracts/canonical.types';

export interface UpsertVisitorInput {
  projectId: string;
  visitorId: string;
  occurredAt: Date;
  isNewSession: boolean;
  clickIds?: Record<string, string>;
  campaign?: CanonicalCampaign;
  context?: Record<string, unknown>;
  geo?: CanonicalGeo | null;
  fingerprintHash?: string;
  fingerprintVersion?: number;
}

export interface AppendTouchpointInput {
  projectId: string;
  visitorId: string;
  sessionId?: string;
  occurredAt: Date;
  campaign?: CanonicalCampaign;
  clickIds?: Record<string, string>;
  eventType: string;
  eventName: string;
  isConversion: boolean;
  value?: number;
}

/**
 * Persistence for the durable attribution aggregate. Touchpoints are
 * APPEND-ONLY by design (audit/replay/recalculation): this repository only
 * ever create()s them, never update()s.
 */
@Injectable()
export class AttributionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsertVisitor(input: UpsertVisitorInput): Promise<Visitor> {
    const mergePatch: Prisma.VisitorUpdateInput = {
      lastSeenAt: input.occurredAt,
      eventCount: { increment: 1 },
      ...(input.isNewSession ? { sessionCount: { increment: 1 } } : {}),
      ...(input.clickIds && Object.keys(input.clickIds).length > 0
        ? { clickIds: input.clickIds }
        : {}),
      ...(input.campaign ? { lastTouch: input.campaign as never } : {}),
      ...(input.context ? { context: input.context as never } : {}),
      ...(input.geo ? { geo: input.geo as never } : {}),
      ...(input.fingerprintHash
        ? {
            fingerprintHash: input.fingerprintHash,
            fingerprintVersion: input.fingerprintVersion,
          }
        : {}),
    };

    return this.prisma.visitor.upsert({
      where: {
        projectId_visitorId: {
          projectId: input.projectId,
          visitorId: input.visitorId,
        },
      },
      create: {
        projectId: input.projectId,
        visitorId: input.visitorId,
        firstSeenAt: input.occurredAt,
        lastSeenAt: input.occurredAt,
        sessionCount: 1,
        eventCount: 1,
        clickIds: (input.clickIds ?? undefined) as never,
        firstTouch: (input.campaign ?? undefined) as never,
        lastTouch: (input.campaign ?? undefined) as never,
        context: (input.context ?? undefined) as never,
        geo: (input.geo ?? undefined) as never,
        fingerprintHash: input.fingerprintHash,
        fingerprintVersion: input.fingerprintVersion,
      },
      update: mergePatch,
    });
  }

  /** Sticky click IDs: merge incoming over what's already stored. */
  async mergeClickIds(
    projectId: string,
    visitorId: string,
    incoming: Record<string, string>,
  ): Promise<Record<string, string>> {
    const visitor = await this.prisma.visitor.findUnique({
      where: { projectId_visitorId: { projectId, visitorId } },
      select: { clickIds: true },
    });
    const merged = {
      ...((visitor?.clickIds as Record<string, string> | null) ?? {}),
      ...incoming,
    };
    if (visitor) {
      await this.prisma.visitor.update({
        where: { projectId_visitorId: { projectId, visitorId } },
        data: { clickIds: merged as never },
      });
    }
    return merged;
  }

  /** Append-only: touchpoints are never updated. */
  async appendTouchpoint(input: AppendTouchpointInput): Promise<Touchpoint> {
    const position = await this.prisma.touchpoint.count({
      where: { projectId: input.projectId, visitorId: input.visitorId },
    });
    return this.prisma.touchpoint.create({
      data: {
        projectId: input.projectId,
        visitorId: input.visitorId,
        sessionId: input.sessionId,
        occurredAt: input.occurredAt,
        position: position + 1,
        source: input.campaign?.source,
        medium: input.campaign?.medium,
        campaign: input.campaign?.campaign,
        content: input.campaign?.content,
        term: input.campaign?.term,
        channel: input.campaign?.channel,
        referrer: input.campaign?.referrer,
        landingPage: input.campaign?.landingPage,
        clickIds: (input.clickIds ?? undefined) as never,
        eventType: input.eventType as never,
        eventName: input.eventName,
        isConversion: input.isConversion,
        value: input.value,
      },
    });
  }

  async getVisitor(
    projectId: string,
    visitorId: string,
  ): Promise<Visitor | null> {
    return this.prisma.visitor.findUnique({
      where: { projectId_visitorId: { projectId, visitorId } },
    });
  }

  async getTouchpoints(
    projectId: string,
    visitorId: string,
  ): Promise<Touchpoint[]> {
    return this.prisma.touchpoint.findMany({
      where: { projectId, visitorId },
      orderBy: { occurredAt: 'asc' },
    });
  }

  async recordConversion(
    projectId: string,
    visitorId: string,
    occurredAt: Date,
    value: number | undefined,
    attribution: unknown,
  ): Promise<void> {
    await this.prisma.visitor.update({
      where: { projectId_visitorId: { projectId, visitorId } },
      data: {
        convertedAt: occurredAt,
        conversionCount: { increment: 1 },
        ...(value != null ? { conversionValue: { increment: value } } : {}),
        attribution: attribution as never,
      },
    });
  }

  async saveAttribution(
    projectId: string,
    visitorId: string,
    attribution: unknown,
  ): Promise<void> {
    await this.prisma.visitor.update({
      where: { projectId_visitorId: { projectId, visitorId } },
      data: { attribution: attribution as never },
    });
  }

  // ---------- dashboard-ready read queries ----------

  async topCampaigns(projectId: string, days: number, limit = 10) {
    const cutoff = new Date(Date.now() - days * 864e5);
    return this.prisma.touchpoint.groupBy({
      by: ['campaign', 'source', 'medium'],
      where: {
        projectId,
        occurredAt: { gte: cutoff },
        campaign: { not: null },
      },
      _count: { _all: true },
      _sum: { value: true },
      orderBy: { _count: { campaign: 'desc' } },
      take: limit,
    });
  }

  async topSources(projectId: string, days: number, limit = 10) {
    const cutoff = new Date(Date.now() - days * 864e5);
    return this.prisma.touchpoint.groupBy({
      by: ['source'],
      where: { projectId, occurredAt: { gte: cutoff }, source: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { source: 'desc' } },
      take: limit,
    });
  }

  async channels(projectId: string, days: number) {
    const cutoff = new Date(Date.now() - days * 864e5);
    return this.prisma.touchpoint.groupBy({
      by: ['channel'],
      where: { projectId, occurredAt: { gte: cutoff } },
      _count: { _all: true },
      _sum: { value: true },
      orderBy: { _count: { channel: 'desc' } },
    });
  }

  async listVisitors(projectId: string, page: number, pageSize: number) {
    const [visitors, total] = await Promise.all([
      this.prisma.visitor.findMany({
        where: { projectId },
        orderBy: { lastSeenAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.visitor.count({ where: { projectId } }),
    ]);
    return { visitors, total, page, pageSize };
  }

  async conversions(projectId: string, days: number) {
    const cutoff = new Date(Date.now() - days * 864e5);
    return this.prisma.visitor.findMany({
      where: { projectId, convertedAt: { gte: cutoff } },
      orderBy: { convertedAt: 'desc' },
      select: {
        visitorId: true,
        convertedAt: true,
        conversionCount: true,
        conversionValue: true,
        attribution: true,
        firstTouch: true,
        lastTouch: true,
      },
    });
  }

  async sessionsSummary(projectId: string, days: number) {
    const cutoff = new Date(Date.now() - days * 864e5);
    const agg = await this.prisma.visitor.aggregate({
      where: { projectId, lastSeenAt: { gte: cutoff } },
      _sum: { sessionCount: true, eventCount: true },
      _count: { _all: true },
    });
    return {
      visitors: agg._count._all,
      sessions: agg._sum.sessionCount ?? 0,
      events: agg._sum.eventCount ?? 0,
    };
  }
}
