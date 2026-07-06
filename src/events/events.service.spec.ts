import type { Project } from '../../generated/prisma/client';
import { EncryptionService } from '../crypto/encryption.service';
import { ForwardingService } from '../forwarding/forwarding.service';
import { PrismaService } from '../prisma/prisma.service';
import { TrackerService } from '../tracker/tracker.service';
import { CreateEventDto } from './dto/create-event.dto';
import { EventsService } from './events.service';

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

describe('EventsService#createEvent', () => {
  let prisma: jest.Mocked<PrismaService>;
  let encryptionService: jest.Mocked<EncryptionService>;
  let forwardingService: jest.Mocked<ForwardingService>;
  let trackerService: jest.Mocked<TrackerService>;
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

    service = new EventsService(
      prisma,
      encryptionService,
      forwardingService,
      trackerService,
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

  it('persists the enriched event and enqueues forwarding for a normal event', async () => {
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
    expect(forwardingService.enqueueForwards).toHaveBeenCalledWith(
      savedEvent,
      expect.any(Object),
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
});
