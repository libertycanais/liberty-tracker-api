import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { ForwardStatus, Platform } from '../../../generated/prisma/enums';
import { EncryptionService } from '../../crypto/encryption.service';
import { DomainEventsService } from '../../domain-events/domain-events.service';
import { MetricsService } from '../../observability/metrics/metrics.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  Ga4MpService,
  type Ga4SendCredential,
} from '../platforms/ga4-mp.service';
import {
  GoogleAdsService,
  type GoogleAdsSendCredential,
} from '../platforms/google-ads.service';
import {
  MetaCapiService,
  type MetaSendCredential,
} from '../platforms/meta-capi.service';
import type { ForwarderResult } from '../platforms/forwarder.interface';
import type { ForwardJobData } from '../forwarding.service';

@Processor('event-forwarding')
export class EventForwardingProcessor extends WorkerHost {
  private readonly logger = new Logger(EventForwardingProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly metaCapiService: MetaCapiService,
    private readonly ga4MpService: Ga4MpService,
    private readonly googleAdsService: GoogleAdsService,
    private readonly metricsService: MetricsService,
    private readonly domainEvents: DomainEventsService,
  ) {
    super();
  }

  async process(job: Job<ForwardJobData>): Promise<void> {
    const { eventId, platform, correlationId } = job.data;
    if (job.timestamp) {
      this.metricsService.recordQueueWaitTime(Date.now() - job.timestamp);
    }
    const processingStartedAt = Date.now();

    const event = await this.prisma.event.findUniqueOrThrow({
      where: { id: eventId },
    });
    const credentialRow = await this.prisma.platformCredential.findUnique({
      where: { projectId_platform: { projectId: event.projectId, platform } },
    });

    if (!credentialRow || !credentialRow.isActive) {
      await this.prisma.eventForward.update({
        where: { eventId_platform: { eventId, platform } },
        data: {
          status: ForwardStatus.SKIPPED,
          errorMessage: 'No active credential configured',
        },
      });
      this.metricsService.incrementEventsSkippedForwarding();
      return;
    }

    const payload: unknown = JSON.parse(
      this.encryptionService.decrypt(credentialRow.encryptedPayload),
    );

    if (platform === Platform.GOOGLE_ADS && !event.gclid) {
      await this.prisma.eventForward.update({
        where: { eventId_platform: { eventId, platform } },
        data: {
          status: ForwardStatus.SKIPPED,
          errorMessage:
            'Evento sem gclid; não é possível reportar conversão de clique',
        },
      });
      this.metricsService.incrementEventsSkippedForwarding();
      return;
    }

    this.domainEvents.publish('ForwardStarted', {
      correlationId: correlationId ?? eventId,
      projectId: event.projectId,
      eventId,
      platform,
    });

    let result: ForwarderResult;
    if (platform === Platform.META) {
      result = await this.metaCapiService.send(event, {
        ...(payload as MetaSendCredential),
        testEventCode: credentialRow.metaTestEventCode ?? undefined,
      });
    } else if (platform === Platform.GA4) {
      result = await this.ga4MpService.send(
        event,
        payload as Ga4SendCredential,
      );
    } else {
      result = await this.googleAdsService.send(
        event,
        payload as GoogleAdsSendCredential,
      );
    }

    this.metricsService.recordQueueProcessingTime(
      Date.now() - processingStartedAt,
    );

    await this.prisma.eventForward.update({
      where: { eventId_platform: { eventId, platform } },
      data: {
        status: result.success ? ForwardStatus.SUCCESS : ForwardStatus.FAILED,
        attempt: { increment: 1 },
        httpStatus: result.httpStatus,
        responsePayload: (result.responseBody ?? undefined) as never,
        errorMessage: result.errorMessage,
        sentAt: result.success ? new Date() : undefined,
      },
    });

    if (!result.success) {
      this.metricsService.incrementQueueJobsFailed();
      this.domainEvents.publish('ForwardFailed', {
        correlationId: correlationId ?? eventId,
        projectId: event.projectId,
        eventId,
        platform,
        errorMessage: result.errorMessage,
      });
      this.logger.warn(
        `Forward failed for event ${eventId} -> ${platform}: ${result.errorMessage}`,
      );
      throw new Error(result.errorMessage ?? `Forward to ${platform} failed`);
    }

    this.metricsService.incrementQueueJobsCompleted();
    this.domainEvents.publish('ForwardSucceeded', {
      correlationId: correlationId ?? eventId,
      projectId: event.projectId,
      eventId,
      platform,
    });
  }
}
