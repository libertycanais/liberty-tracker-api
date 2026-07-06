import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import type { Project } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AttributionEngineService } from './attribution-engine.service';
import { SessionManagerService } from './session-manager.service';
import { TrackerRepository } from './tracker.repository';
import { TrackerService } from './tracker.service';
import { VisitorManagerService } from './visitor-manager.service';

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'project-1',
    workspaceId: 'workspace-1',
    name: 'Test',
    slug: 'test',
    apiKeyHash: 'hash',
    apiKeyEncrypted: 'enc',
    waPhoneNumber: null,
    waDefaultMessage: null,
    domain: null,
    trackerConfig: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('TrackerService', () => {
  let repository: jest.Mocked<TrackerRepository>;
  let visitorManager: jest.Mocked<VisitorManagerService>;
  let sessionManager: jest.Mocked<SessionManagerService>;
  let attributionEngine: jest.Mocked<AttributionEngineService>;
  let prisma: jest.Mocked<PrismaService>;
  let service: TrackerService;

  beforeEach(() => {
    repository = {
      getTrackerConfig: jest.fn().mockResolvedValue(null),
      updateTrackerConfig: jest.fn(),
    } as unknown as jest.Mocked<TrackerRepository>;
    visitorManager = {
      resolve: jest.fn().mockResolvedValue({
        isNewVisitor: true,
        firstSeenAt: new Date(),
        sessionCount: 0,
      }),
      incrementSessionCount: jest.fn(),
    } as unknown as jest.Mocked<VisitorManagerService>;
    sessionManager = {
      resolve: jest.fn().mockResolvedValue({
        sessionId: 'session-1',
        isNewSession: true,
        sessionStartedAt: new Date(),
      }),
    } as unknown as jest.Mocked<SessionManagerService>;
    attributionEngine = {
      resolve: jest.fn().mockResolvedValue({ utmSource: 'google' }),
    } as unknown as jest.Mocked<AttributionEngineService>;
    prisma = {
      project: { findFirst: jest.fn() },
    } as unknown as jest.Mocked<PrismaService>;

    service = new TrackerService(
      prisma,
      repository,
      visitorManager,
      sessionManager,
      attributionEngine,
    );
  });

  describe('processIngestion', () => {
    it('short-circuits as blocked when the event name is in blockedEvents', async () => {
      repository.getTrackerConfig.mockResolvedValue({
        blockedEvents: ['Spam'],
      });

      const decision = await service.processIngestion(makeProject(), {
        visitorId: 'v1',
        eventName: 'Spam',
        eventType: 'CUSTOM',
      });

      expect(decision).toEqual({ kind: 'blocked', reason: 'event_blocked' });
      expect(visitorManager.resolve).not.toHaveBeenCalled();
    });

    it('resolves visitor/session but skips attribution for HEARTBEAT events', async () => {
      const decision = await service.processIngestion(makeProject(), {
        visitorId: 'v1',
        sessionId: 's1',
        eventName: 'Heartbeat',
        eventType: 'HEARTBEAT',
      });

      expect(decision).toEqual({
        kind: 'heartbeat',
        sessionId: 'session-1',
        isNewSession: true,
      });
      expect(attributionEngine.resolve).not.toHaveBeenCalled();
    });

    it('resolves the full enrichment for a normal event', async () => {
      const decision = await service.processIngestion(makeProject(), {
        visitorId: 'v1',
        eventName: 'PageView',
        eventType: 'PAGE_VIEW',
      });

      expect(decision.kind).toBe('event');
      if (decision.kind === 'event') {
        expect(decision.attribution).toEqual({ utmSource: 'google' });
        expect(decision.isNewVisitor).toBe(true);
        expect(decision.sessionId).toBe('session-1');
      }
    });

    it('increments the visitor session count when a returning visitor starts a new session', async () => {
      visitorManager.resolve.mockResolvedValue({
        isNewVisitor: false,
        firstSeenAt: new Date(),
        sessionCount: 2,
      });

      await service.processIngestion(makeProject(), {
        visitorId: 'v1',
        eventName: 'PageView',
        eventType: 'PAGE_VIEW',
      });

      expect(visitorManager.incrementSessionCount).toHaveBeenCalledWith(
        'project-1',
        'v1',
      );
    });
  });

  describe('assertDomainAllowed', () => {
    it('allows the request when there is no Origin/Referer header', async () => {
      const req = { headers: {} } as Request;
      await expect(
        service.assertDomainAllowed(
          makeProject({ domain: 'liberty.click' }),
          req,
        ),
      ).resolves.toBeUndefined();
    });

    it('allows a matching origin', async () => {
      const req = { headers: { origin: 'https://liberty.click' } } as Request;
      await expect(
        service.assertDomainAllowed(
          makeProject({ domain: 'liberty.click' }),
          req,
        ),
      ).resolves.toBeUndefined();
    });

    it('rejects a mismatched origin', async () => {
      const req = { headers: { origin: 'https://evil.com' } } as Request;
      await expect(
        service.assertDomainAllowed(
          makeProject({ domain: 'liberty.click' }),
          req,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows an origin present in trackerConfig.allowedDomains in addition to project.domain', async () => {
      repository.getTrackerConfig.mockResolvedValue({
        allowedDomains: ['staging.liberty.click'],
      });
      const req = {
        headers: { origin: 'https://staging.liberty.click' },
      } as Request;

      await expect(
        service.assertDomainAllowed(
          makeProject({ domain: 'liberty.click' }),
          req,
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe('getConfig/updateConfig', () => {
    it('throws NotFoundException when the project does not belong to the workspace', async () => {
      (prisma.project.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.getConfig('workspace-1', 'project-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns resolved defaults when no config was ever saved', async () => {
      (prisma.project.findFirst as jest.Mock).mockResolvedValue(makeProject());

      const config = await service.getConfig('workspace-1', 'project-1');

      expect(config.sessionTimeoutMinutes).toBe(30);
      expect(config.heartbeatIntervalSeconds).toBe(15);
    });

    it('merges partial updates on top of the existing config', async () => {
      (prisma.project.findFirst as jest.Mock).mockResolvedValue(makeProject());
      repository.getTrackerConfig.mockResolvedValue({
        sessionTimeoutMinutes: 45,
        blockedEvents: ['Spam'],
      });

      const config = await service.updateConfig('workspace-1', 'project-1', {
        heartbeatIntervalSeconds: 20,
      });

      expect(repository.updateTrackerConfig).toHaveBeenCalledWith('project-1', {
        sessionTimeoutMinutes: 45,
        blockedEvents: ['Spam'],
        heartbeatIntervalSeconds: 20,
      });
      expect(config.sessionTimeoutMinutes).toBe(45);
      expect(config.heartbeatIntervalSeconds).toBe(20);
    });
  });
});
