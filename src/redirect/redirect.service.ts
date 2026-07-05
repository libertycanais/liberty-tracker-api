import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EventsService } from '../events/events.service';
import { PrismaService } from '../prisma/prisma.service';

interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class RedirectService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
  ) {}

  async logClickAndBuildWaUrl(
    projectId: string,
    campaignSlug: string,
    query: Record<string, string>,
    meta: RequestMeta,
  ): Promise<string> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project || !project.waPhoneNumber) {
      throw new NotFoundException(
        'WhatsApp redirect not configured for this project',
      );
    }

    const visitorId = query.vid ?? randomUUID();

    await this.eventsService.createEvent(
      project,
      {
        visitorId,
        eventName: 'WhatsAppClick',
        eventType: 'WHATSAPP_CLICK',
        utmSource: query.utm_source,
        utmMedium: query.utm_medium,
        utmCampaign: query.utm_campaign ?? campaignSlug,
        utmTerm: query.utm_term,
        utmContent: query.utm_content,
        fbclid: query.fbclid,
        gclid: query.gclid,
        metadata: { campaignSlug },
      },
      meta,
    );

    const phone = project.waPhoneNumber.replace(/\D/g, '');
    const message = project.waDefaultMessage;
    return `https://wa.me/${phone}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
  }
}
