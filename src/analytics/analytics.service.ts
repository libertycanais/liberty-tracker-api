import { Injectable, NotFoundException } from '@nestjs/common';
import {
  EventType,
  ForwardStatus,
  Platform,
} from '../../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

const FUNNEL_STAGES: EventType[] = [
  EventType.PAGE_VIEW,
  EventType.WHATSAPP_CLICK,
  EventType.LEAD,
  EventType.PURCHASE,
  EventType.SUBSCRIPTION,
];

const NO_CAMPAIGN_LABEL = '(sem campanha)';

export interface FunnelRow {
  campaign: string;
  counts: Partial<Record<EventType, number>>;
}

interface EventCountRow {
  day: Date;
  count: number;
}

interface ForwardCountRow {
  day: Date;
  platform: Platform;
  status: ForwardStatus;
  count: number;
}

export interface TimeseriesDay {
  date: string;
  eventCount: number;
  forwards: Partial<Record<Platform, { success: number; failed: number }>>;
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getFunnel(workspaceId: string, projectId: string, days: number) {
    await this.assertOwnership(workspaceId, projectId);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await this.prisma.event.groupBy({
      by: ['utmCampaign', 'eventType'],
      where: { projectId, occurredAt: { gte: cutoff } },
      _count: { _all: true },
    });

    const campaignMap = new Map<string, Partial<Record<EventType, number>>>();
    const totals: Partial<Record<EventType, number>> = {};

    for (const row of rows) {
      const campaign = row.utmCampaign ?? NO_CAMPAIGN_LABEL;
      const count = row._count._all;
      if (!campaignMap.has(campaign)) {
        campaignMap.set(campaign, {});
      }
      campaignMap.get(campaign)![row.eventType] = count;
      totals[row.eventType] = (totals[row.eventType] ?? 0) + count;
    }

    const campaignTotal = (counts: Partial<Record<EventType, number>>) =>
      Object.values(counts).reduce((sum: number, n) => sum + (n ?? 0), 0);

    const rowsSorted: FunnelRow[] = [...campaignMap.entries()]
      .sort((a, b) => campaignTotal(b[1]) - campaignTotal(a[1]))
      .slice(0, 10)
      .map(([campaign, counts]) => ({ campaign, counts }));

    return {
      days,
      stages: FUNNEL_STAGES,
      rows: rowsSorted,
      totals,
    };
  }

  async getTimeseries(workspaceId: string, projectId: string, days: number) {
    await this.assertOwnership(workspaceId, projectId);
    const now = new Date();
    const todayUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const cutoff = new Date(
      todayUtc.getTime() - (days - 1) * 24 * 60 * 60 * 1000,
    );

    const eventRows = await this.prisma.$queryRaw<EventCountRow[]>`
      SELECT date_trunc('day', "occurredAt") AS day, count(*)::int AS count
      FROM "Event"
      WHERE "projectId" = ${projectId} AND "occurredAt" >= ${cutoff}
      GROUP BY day
      ORDER BY day
    `;

    const forwardRows = await this.prisma.$queryRaw<ForwardCountRow[]>`
      SELECT date_trunc('day', e."occurredAt") AS day, ef.platform AS platform, ef.status AS status, count(*)::int AS count
      FROM "EventForward" ef
      JOIN "Event" e ON e.id = ef."eventId"
      WHERE e."projectId" = ${projectId} AND e."occurredAt" >= ${cutoff}
      GROUP BY day, ef.platform, ef.status
      ORDER BY day
    `;

    const eventCountByDay = new Map<string, number>();
    for (const row of eventRows) {
      eventCountByDay.set(dayKey(row.day), row.count);
    }

    const forwardByDay = new Map<
      string,
      Partial<Record<Platform, { success: number; failed: number }>>
    >();
    for (const row of forwardRows) {
      if (
        row.status !== ForwardStatus.SUCCESS &&
        row.status !== ForwardStatus.FAILED
      ) {
        continue;
      }
      const key = dayKey(row.day);
      if (!forwardByDay.has(key)) {
        forwardByDay.set(key, {});
      }
      const platforms = forwardByDay.get(key)!;
      if (!platforms[row.platform]) {
        platforms[row.platform] = { success: 0, failed: 0 };
      }
      if (row.status === ForwardStatus.SUCCESS) {
        platforms[row.platform]!.success += row.count;
      } else {
        platforms[row.platform]!.failed += row.count;
      }
    }

    const startDay = new Date(
      Date.UTC(
        cutoff.getUTCFullYear(),
        cutoff.getUTCMonth(),
        cutoff.getUTCDate(),
      ),
    );
    const series: TimeseriesDay[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(startDay.getTime() + i * 24 * 60 * 60 * 1000);
      const key = dayKey(d);
      series.push({
        date: key,
        eventCount: eventCountByDay.get(key) ?? 0,
        forwards: forwardByDay.get(key) ?? {},
      });
    }

    return { days, series };
  }

  private async assertOwnership(
    workspaceId: string,
    projectId: string,
  ): Promise<void> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, workspaceId },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
  }
}
