import type { Job } from 'bullmq';
import { ForwardStatus, Platform } from '../../../generated/prisma/enums';
import { EncryptionService } from '../../crypto/encryption.service';
import { DomainEventsService } from '../../domain-events/domain-events.service';
import { MetricsService } from '../../observability/metrics/metrics.service';
import { PrismaService } from '../../prisma/prisma.service';
import { Ga4MpService } from '../platforms/ga4-mp.service';
import { GoogleAdsService } from '../platforms/google-ads.service';
import { MetaCapiService } from '../platforms/meta-capi.service';
import type { ForwardJobData } from '../forwarding.service';
import { EventForwardingProcessor } from './event-forwarding.processor';

function makeJob(
  data: ForwardJobData,
  timestamp = Date.now() - 500,
): Job<ForwardJobData> {
  return { data, timestamp } as Job<ForwardJobData>;
}

describe('EventForwardingProcessor#process', () => {
  let prisma: jest.Mocked<PrismaService>;
  let encryptionService: jest.Mocked<EncryptionService>;
  let metaCapiService: jest.Mocked<MetaCapiService>;
  let ga4MpService: jest.Mocked<Ga4MpService>;
  let googleAdsService: jest.Mocked<GoogleAdsService>;
  let metricsService: jest.Mocked<MetricsService>;
  let domainEvents: jest.Mocked<DomainEventsService>;
  let processor: EventForwardingProcessor;

  const baseEvent = {
    id: 'event-1',
    projectId: 'project-1',
    gclid: null as string | null,
  };

  beforeEach(() => {
    prisma = {
      event: { findUniqueOrThrow: jest.fn().mockResolvedValue(baseEvent) },
      platformCredential: { findUnique: jest.fn() },
      eventForward: { update: jest.fn() },
    } as unknown as jest.Mocked<PrismaService>;
    encryptionService = {
      decrypt: jest.fn().mockReturnValue('{}'),
    } as unknown as jest.Mocked<EncryptionService>;
    metaCapiService = {
      send: jest.fn(),
    } as unknown as jest.Mocked<MetaCapiService>;
    ga4MpService = { send: jest.fn() } as unknown as jest.Mocked<Ga4MpService>;
    googleAdsService = {
      send: jest.fn(),
    } as unknown as jest.Mocked<GoogleAdsService>;
    metricsService = {
      recordQueueWaitTime: jest.fn(),
      recordQueueProcessingTime: jest.fn(),
      incrementEventsSkippedForwarding: jest.fn(),
      incrementQueueJobsCompleted: jest.fn(),
      incrementQueueJobsFailed: jest.fn(),
    } as unknown as jest.Mocked<MetricsService>;
    domainEvents = {
      publish: jest.fn(),
    } as unknown as jest.Mocked<DomainEventsService>;

    processor = new EventForwardingProcessor(
      prisma,
      encryptionService,
      metaCapiService,
      ga4MpService,
      googleAdsService,
      metricsService,
      domainEvents,
    );
  });

  it('records the queue wait time from the BullMQ job timestamp', async () => {
    (prisma.platformCredential.findUnique as jest.Mock).mockResolvedValue(null);
    await processor.process(
      makeJob({ eventId: 'event-1', platform: Platform.META }),
    );
    expect(metricsService.recordQueueWaitTime).toHaveBeenCalledWith(
      expect.any(Number),
    );
  });

  it('skips (does not throw) when there is no active credential for the platform', async () => {
    (prisma.platformCredential.findUnique as jest.Mock).mockResolvedValue(null);

    await processor.process(
      makeJob({ eventId: 'event-1', platform: Platform.META }),
    );

    expect(prisma.eventForward.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: ForwardStatus.SKIPPED }),
      }),
    );
    expect(metricsService.incrementEventsSkippedForwarding).toHaveBeenCalled();
    expect(metaCapiService.send).not.toHaveBeenCalled();
  });

  it('skips Google Ads when the event has no gclid, without calling the platform', async () => {
    (prisma.platformCredential.findUnique as jest.Mock).mockResolvedValue({
      isActive: true,
      encryptedPayload: 'enc',
    });

    await processor.process(
      makeJob({ eventId: 'event-1', platform: Platform.GOOGLE_ADS }),
    );

    expect(googleAdsService.send).not.toHaveBeenCalled();
    expect(metricsService.incrementEventsSkippedForwarding).toHaveBeenCalled();
  });

  it('publishes ForwardStarted and ForwardSucceeded and marks SUCCESS on a successful send', async () => {
    (prisma.platformCredential.findUnique as jest.Mock).mockResolvedValue({
      isActive: true,
      encryptedPayload: 'enc',
    });
    metaCapiService.send.mockResolvedValue({ success: true, httpStatus: 200 });

    await processor.process(
      makeJob({
        eventId: 'event-1',
        platform: Platform.META,
        correlationId: 'corr-1',
      }),
    );

    expect(domainEvents.publish).toHaveBeenCalledWith(
      'ForwardStarted',
      expect.objectContaining({
        correlationId: 'corr-1',
        platform: Platform.META,
      }),
    );
    expect(domainEvents.publish).toHaveBeenCalledWith(
      'ForwardSucceeded',
      expect.objectContaining({ correlationId: 'corr-1' }),
    );
    expect(metricsService.incrementQueueJobsCompleted).toHaveBeenCalled();
    expect(prisma.eventForward.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: ForwardStatus.SUCCESS }),
      }),
    );
  });

  it('publishes ForwardFailed, marks FAILED and rethrows so BullMQ retries on failure', async () => {
    (prisma.platformCredential.findUnique as jest.Mock).mockResolvedValue({
      isActive: true,
      encryptedPayload: 'enc',
    });
    metaCapiService.send.mockResolvedValue({
      success: false,
      errorMessage: 'invalid token',
    });

    await expect(
      processor.process(
        makeJob({ eventId: 'event-1', platform: Platform.META }),
      ),
    ).rejects.toThrow('invalid token');

    expect(domainEvents.publish).toHaveBeenCalledWith(
      'ForwardFailed',
      expect.objectContaining({ errorMessage: 'invalid token' }),
    );
    expect(metricsService.incrementQueueJobsFailed).toHaveBeenCalled();
    expect(prisma.eventForward.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: ForwardStatus.FAILED }),
      }),
    );
  });

  it('dispatches GA4 events to Ga4MpService', async () => {
    (prisma.platformCredential.findUnique as jest.Mock).mockResolvedValue({
      isActive: true,
      encryptedPayload: 'enc',
    });
    ga4MpService.send.mockResolvedValue({ success: true });

    await processor.process(
      makeJob({ eventId: 'event-1', platform: Platform.GA4 }),
    );

    expect(ga4MpService.send).toHaveBeenCalled();
    expect(metaCapiService.send).not.toHaveBeenCalled();
  });
});
