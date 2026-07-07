import { Prisma } from '../../generated/prisma/client';
import { Platform } from '../../generated/prisma/enums';
import type { Event, Project } from '../../generated/prisma/client';
import { MetricsService } from '../observability/metrics/metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import { ForwardingService } from './forwarding.service';

function makeP2002Error(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '7.8.0',
  });
}

describe('ForwardingService#enqueueForwards', () => {
  let prisma: jest.Mocked<PrismaService>;
  let metricsService: jest.Mocked<MetricsService>;
  let queueAdd: jest.Mock;
  let service: ForwardingService;
  const event = { id: 'event-1' } as Event;
  const project = { id: 'project-1' } as Project;

  beforeEach(() => {
    queueAdd = jest.fn().mockResolvedValue(undefined);
    prisma = {
      platformCredential: {
        findMany: jest.fn().mockResolvedValue([{ platform: Platform.META }]),
      },
      eventForward: { upsert: jest.fn() },
    } as unknown as jest.Mocked<PrismaService>;
    metricsService = {
      incrementQueueEnqueueFailures: jest.fn(),
    } as unknown as jest.Mocked<MetricsService>;

    service = new ForwardingService(prisma, metricsService, {
      add: queueAdd,
    } as never);
  });

  it('upserts a PENDING EventForward and enqueues a job per active credential', async () => {
    await service.enqueueForwards(event, project, 'corr-1');

    expect(prisma.eventForward.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          eventId_platform: { eventId: 'event-1', platform: Platform.META },
        },
      }),
    );
    expect(queueAdd).toHaveBeenCalledWith(
      'forward',
      { eventId: 'event-1', platform: Platform.META, correlationId: 'corr-1' },
      expect.objectContaining({ attempts: 5 }),
    );
  });

  it('skips re-adding the job when a concurrent request already created the EventForward row (P2002)', async () => {
    (prisma.eventForward.upsert as jest.Mock).mockRejectedValue(
      makeP2002Error(),
    );

    await service.enqueueForwards(event, project);

    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('re-throws unexpected errors from the EventForward upsert', async () => {
    (prisma.eventForward.upsert as jest.Mock).mockRejectedValue(
      new Error('db down'),
    );

    await expect(service.enqueueForwards(event, project)).rejects.toThrow(
      'db down',
    );
  });

  it('does not fail the request when BullMQ/Redis is unavailable — logs and records a metric instead', async () => {
    queueAdd.mockRejectedValue(new Error('Redis connection lost'));

    await expect(
      service.enqueueForwards(event, project),
    ).resolves.toBeUndefined();
    expect(metricsService.incrementQueueEnqueueFailures).toHaveBeenCalled();
  });
});
