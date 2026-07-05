import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { ForwardStatus, Platform } from '../../../generated/prisma/enums';
import { EncryptionService } from '../../crypto/encryption.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  Ga4MpService,
  type Ga4SendCredential,
} from '../platforms/ga4-mp.service';
import {
  MetaCapiService,
  type MetaSendCredential,
} from '../platforms/meta-capi.service';
import type { ForwardJobData } from '../forwarding.service';

@Processor('event-forwarding')
export class EventForwardingProcessor extends WorkerHost {
  private readonly logger = new Logger(EventForwardingProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly metaCapiService: MetaCapiService,
    private readonly ga4MpService: Ga4MpService,
  ) {
    super();
  }

  async process(job: Job<ForwardJobData>): Promise<void> {
    const { eventId, platform } = job.data;

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
      return;
    }

    const payload: unknown = JSON.parse(
      this.encryptionService.decrypt(credentialRow.encryptedPayload),
    );

    if (platform === Platform.GOOGLE_ADS) {
      await this.prisma.eventForward.update({
        where: { eventId_platform: { eventId, platform } },
        data: {
          status: ForwardStatus.SKIPPED,
          errorMessage: 'Google Ads forwarding not implemented yet',
        },
      });
      return;
    }

    const result =
      platform === Platform.META
        ? await this.metaCapiService.send(event, {
            ...(payload as MetaSendCredential),
            testEventCode: credentialRow.metaTestEventCode ?? undefined,
          })
        : await this.ga4MpService.send(event, payload as Ga4SendCredential);

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
      this.logger.warn(
        `Forward failed for event ${eventId} -> ${platform}: ${result.errorMessage}`,
      );
      throw new Error(result.errorMessage ?? `Forward to ${platform} failed`);
    }
  }
}
