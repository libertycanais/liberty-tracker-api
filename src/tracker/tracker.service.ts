import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Project } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AttributionEngineService } from './attribution-engine.service';
import {
  resolveTrackerConfig,
  isEventNameAllowed,
} from './entities/tracker-config.entity';
import type { IngestionDecision } from './interfaces/ingestion-decision.interface';
import { SessionManagerService } from './session-manager.service';
import { TrackerRepository } from './tracker.repository';
import type { ResolvedTrackerConfig, TrackerConfig } from './tracker.types';
import { hostnameOf, isDomainAllowed } from './tracker.utils';
import { VisitorManagerService } from './visitor-manager.service';

interface IngestionInput {
  visitorId: string;
  sessionId?: string;
  eventName: string;
  eventType: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  fbclid?: string;
  gclid?: string;
}

@Injectable()
export class TrackerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: TrackerRepository,
    private readonly visitorManager: VisitorManagerService,
    private readonly sessionManager: SessionManagerService,
    private readonly attributionEngine: AttributionEngineService,
  ) {}

  async assertDomainAllowed(project: Project, req: Request): Promise<void> {
    const originHost =
      hostnameOf(req.headers.origin) ?? hostnameOf(req.headers.referer);
    if (!originHost) return;

    const rawConfig = await this.repository.getTrackerConfig(project.id);
    const config = resolveTrackerConfig(rawConfig);
    const allowedDomains = [project.domain, ...config.allowedDomains].filter(
      (domain): domain is string => Boolean(domain),
    );

    if (!isDomainAllowed(originHost, allowedDomains)) {
      throw new ForbiddenException('Origin does not match project domain');
    }
  }

  async processIngestion(
    project: Project,
    dto: IngestionInput,
  ): Promise<IngestionDecision> {
    const rawConfig = await this.repository.getTrackerConfig(project.id);
    const config = resolveTrackerConfig(rawConfig);

    if (!isEventNameAllowed(config, dto.eventName)) {
      return { kind: 'blocked', reason: 'event_blocked' };
    }

    const visitorState = await this.visitorManager.resolve(
      project.id,
      dto.visitorId,
    );
    const sessionState = await this.sessionManager.resolve(
      project.id,
      dto.visitorId,
      dto.sessionId,
      config.sessionTimeoutMinutes,
    );
    if (sessionState.isNewSession && !visitorState.isNewVisitor) {
      await this.visitorManager.incrementSessionCount(
        project.id,
        dto.visitorId,
      );
    }

    if (dto.eventType === 'HEARTBEAT') {
      return {
        kind: 'heartbeat',
        sessionId: sessionState.sessionId,
        isNewSession: sessionState.isNewSession,
      };
    }

    const attribution = await this.attributionEngine.resolve(
      project.id,
      dto.visitorId,
      dto,
    );

    return {
      kind: 'event',
      sessionId: sessionState.sessionId,
      isNewVisitor: visitorState.isNewVisitor,
      isNewSession: sessionState.isNewSession,
      sessionStartedAt: sessionState.sessionStartedAt,
      attribution,
    };
  }

  async getConfig(
    workspaceId: string,
    projectId: string,
  ): Promise<ResolvedTrackerConfig> {
    await this.assertOwnership(workspaceId, projectId);
    const raw = await this.repository.getTrackerConfig(projectId);
    return resolveTrackerConfig(raw);
  }

  async updateConfig(
    workspaceId: string,
    projectId: string,
    dto: TrackerConfig,
  ): Promise<ResolvedTrackerConfig> {
    await this.assertOwnership(workspaceId, projectId);
    const existing = await this.repository.getTrackerConfig(projectId);
    const merged: TrackerConfig = { ...existing, ...dto };
    await this.repository.updateTrackerConfig(projectId, merged);
    return resolveTrackerConfig(merged);
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
