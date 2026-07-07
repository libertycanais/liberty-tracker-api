import { Prisma } from '../../generated/prisma/client';
import type { Project } from '../../generated/prisma/client';
import { AttributionService } from '../attribution/attribution.service';
import { EncryptionService } from '../crypto/encryption.service';
import { DomainEventsService } from '../domain-events/domain-events.service';
import { ForwardingService } from '../forwarding/forwarding.service';
import { GeolocationService } from '../geolocation/geolocation.service';
import { MetricsService } from '../observability/metrics/metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import { TrackerService } from '../tracker/tracker.service';
import { CreateEventDto } from './dto/create-event.dto';
import { EventsService } from './events.service';
import { EventPipelineService } from './pipeline/event-pipeline.service';
import {
  EmitDomainEventsStage,
  EnrichStage,
  ForwardStage,
  MetricsStage,
  NormalizeStage,
  PersistStage,
  ValidateStage,
} from './pipeline/stages';

function makeProject(): Project {
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
  };
}

function makeDto(overrides: Partial<CreateEventDto> = {}): CreateEventDto {
  return Object.assign(new CreateEventDto(), {
    visitorId: 'visitor-1',
    eventName: 'PageView',
    eventType: 'PAGE_VIEW',
    ...overrides,
  });
}

describe('EventsService#createEvent (via Event Pipeline)', () => {
  let prisma: jest.Mocked<PrismaService>;
  let encryptionService: jest.Mocked<EncryptionService>;
  let forwardingService: jest.Mocked<ForwardingService>;
  let trackerService: jest.Mocked<TrackerService>;
  let metricsService: jest.Mocked<MetricsService>;
  let attributionService: jest.Mocked<AttributionService>;
  let domainEvents: jest.Mocked<DomainEventsService>;
  let service: EventsService;

  beforeEach(() => {
    prisma = {
      event: { upsert: jest.fn() },
    } as unknown as jest.Mocked<PrismaService>;
    encryptionService = {
      encrypt: jest.fn((value: string) => `enc(${value})`),
      decrypt: jest.fn(),
    } as unknown as jest.Mocked<EncryptionService>;
    forwardingService = {
      enqueueForwards: jest.fn(),
    } as unknown as jest.Mocked<ForwardingService>;
    trackerService = {
      processIngestion: jest.fn(),
    } as unknown as jest.Mocked<TrackerService>;
    metricsService = {
      incrementEventsIngested: jest.fn(),
      recordProcessingTime: jest.fn(),
    } as unknown as jest.Mocked<MetricsService>;
    attributionService = {
      resolve: jest.fn(),
    } as unknown as jest.Mocked<AttributionService>;
    domainEvents = {
      publish: jest.fn(),
    } as unknown as jest.Mocked<DomainEventsService>;
    const geolocationService = {
      resolve: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<GeolocationService>;

    const pipeline = new EventPipelineService(
      new ValidateStage(),
      new NormalizeStage(),
      new EnrichStage(trackerService, geolocationService),
      new PersistStage(prisma, encryptionService, attributionService),
      new EmitDomainEventsStage(domainEvents),
      new ForwardStage(forwardingService, domainEvents),
      new MetricsStage(metricsService),
    );
    service = new EventsService(
      prisma,
      encryptionService,
      pipeline,
      metricsService,
    );
  });

  it('returns ignored without touching Postgres or the queue when the tracker blocks the event', async () => {
    trackerService.processIngestion.mockResolvedValue({
      kind: 'blocked',
      reason: 'event_blocked',
    });

    const result = await service.createEvent(makeProject(), makeDto(), {});

    expect(result).toEqual({ status: 'ignored', reason: 'event_blocked' });
    expect(prisma.event.upsert).not.toHaveBeenCalled();
    expect(forwardingService.enqueueForwards).not.toHaveBeenCalled();
  });

  it('returns ok without creating an Event row or enqueueing forwards for a heartbeat', async () => {
    trackerService.processIngestion.mockResolvedValue({
      kind: 'heartbeat',
      sessionId: 'session-1',
      isNewSession: false,
    });

    const result = await service.createEvent(
      makeProject(),
      makeDto({ eventType: 'HEARTBEAT', eventName: 'Heartbeat' }),
      {},
    );

    expect(result).toEqual({
      status: 'ok',
      visitorId: 'visitor-1',
      sessionId: 'session-1',
      isNewSession: false,
    });
    expect(prisma.event.upsert).not.toHaveBeenCalled();
    expect(forwardingService.enqueueForwards).not.toHaveBeenCalled();
  });

  it('persists the enriched event, runs attribution and enqueues forwarding for a normal event', async () => {
    trackerService.processIngestion.mockResolvedValue({
      kind: 'event',
      sessionId: 'session-1',
      isNewVisitor: true,
      isNewSession: true,
      sessionStartedAt: new Date('2026-01-01T00:00:00.000Z'),
      attribution: { utmSource: 'google', gclid: 'abc' },
    });
    const savedEvent = {
      id: 'event-row-1',
      eventId: 'evt-1',
      visitorId: 'visitor-1',
      sessionId: 'session-1',
    };
    (prisma.event.upsert as jest.Mock).mockResolvedValue(savedEvent);

    const result = await service.createEvent(
      makeProject(),
      makeDto({ eventId: 'evt-1' }),
      { ip: '1.2.3.4', userAgent: 'jest' },
    );

    expect(prisma.event.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          sessionId: 'session-1',
          utmSource: 'google',
          gclid: 'abc',
          isNewVisitor: true,
          isNewSession: true,
          ip: '1.2.3.4',
          userAgent: 'jest',
        }),
      }),
    );
    expect(attributionService.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        visitorId: 'visitor-1',
      }),
    );
    expect(forwardingService.enqueueForwards).toHaveBeenCalledWith(
      savedEvent,
      expect.any(Object),
      undefined,
    );
    expect(result).toEqual({
      id: 'event-row-1',
      eventId: 'evt-1',
      status: 'accepted',
      visitorId: 'visitor-1',
      sessionId: 'session-1',
      isNewVisitor: true,
      isNewSession: true,
    });
  });

  it('encrypts email/phone before persisting when provided', async () => {
    trackerService.processIngestion.mockResolvedValue({
      kind: 'event',
      sessionId: 'session-1',
      isNewVisitor: false,
      isNewSession: false,
      sessionStartedAt: new Date(),
      attribution: {},
    });
    (prisma.event.upsert as jest.Mock).mockResolvedValue({
      id: 'e1',
      eventId: 'evt-2',
      visitorId: 'visitor-1',
      sessionId: 'session-1',
    });

    await service.createEvent(
      makeProject(),
      makeDto({ email: 'user@example.com', phone: '+5511999999999' }),
      {},
    );

    expect(encryptionService.encrypt).toHaveBeenCalledWith('user@example.com');
    expect(encryptionService.encrypt).toHaveBeenCalledWith('+5511999999999');
  });

  it('returns the same idempotent response without double-enqueueing or re-attributing on a P2002 race', async () => {
    trackerService.processIngestion.mockResolvedValue({
      kind: 'event',
      sessionId: 'session-1',
      isNewVisitor: true,
      isNewSession: true,
      sessionStartedAt: new Date(),
      attribution: {},
    });
    const p2002 = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002',
      clientVersion: '7.8.0',
    });
    (prisma.event.upsert as jest.Mock).mockRejectedValue(p2002);
    (
      prisma.event as unknown as { findUniqueOrThrow: jest.Mock }
    ).findUniqueOrThrow = jest.fn().mockResolvedValue({
      id: 'existing-row',
      eventId: 'evt-race',
      visitorId: 'visitor-1',
      sessionId: 'existing-session',
    });

    const result = await service.createEvent(
      makeProject(),
      makeDto({ eventId: 'evt-race' }),
      {},
    );

    expect(result).toEqual({
      id: 'existing-row',
      eventId: 'evt-race',
      status: 'accepted',
      visitorId: 'visitor-1',
      sessionId: 'existing-session',
      isNewVisitor: true,
      isNewSession: true,
    });
    expect(forwardingService.enqueueForwards).not.toHaveBeenCalled();
    expect(attributionService.resolve).not.toHaveBeenCalled();
  });

  it('rejects an occurredAt that is absurdly far in the future', async () => {
    trackerService.processIngestion.mockResolvedValue({
      kind: 'event',
      sessionId: 'session-1',
      isNewVisitor: true,
      isNewSession: true,
      sessionStartedAt: new Date(),
      attribution: {},
    });
    const farFuture = new Date(
      Date.now() + 365 * 24 * 60 * 60 * 1000,
    ).toISOString();

    await expect(
      service.createEvent(
        makeProject(),
        makeDto({ occurredAt: farFuture }),
        {},
      ),
    ).rejects.toThrow();
    expect(prisma.event.upsert).not.toHaveBeenCalled();
  });

  it('processes a batch through the same pipeline, one response per event', async () => {
    trackerService.processIngestion.mockResolvedValue({
      kind: 'event',
      sessionId: 'session-1',
      isNewVisitor: false,
      isNewSession: false,
      sessionStartedAt: new Date(),
      attribution: {},
    });
    (prisma.event.upsert as jest.Mock).mockImplementation(
      (args: { create: { eventId: string } }) =>
        Promise.resolve({
          id: 'row-' + args.create.eventId,
          eventId: args.create.eventId,
          visitorId: 'visitor-1',
          sessionId: 'session-1',
        }),
    );

    const result = await service.createEvents(
      makeProject(),
      [makeDto({ eventId: 'b1' }), makeDto({ eventId: 'b2' })],
      {},
    );

    expect(result.count).toBe(2);
    expect(result.results).toHaveLength(2);
    expect(forwardingService.enqueueForwards).toHaveBeenCalledTimes(2);
  });
});
