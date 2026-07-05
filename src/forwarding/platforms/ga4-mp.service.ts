import { Injectable, Logger } from '@nestjs/common';
import type { Event } from '../../../generated/prisma/client';
import type { ForwarderResult } from './forwarder.interface';

export interface Ga4SendCredential {
  measurementId: string;
  apiSecret: string;
}

const EVENT_NAME_MAP: Record<string, string> = {
  PAGE_VIEW: 'page_view',
  WHATSAPP_CLICK: 'whatsapp_click',
  LEAD: 'generate_lead',
  PURCHASE: 'purchase',
  SUBSCRIPTION: 'subscribe',
};

function sanitizeCustomEventName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .slice(0, 40);
}

@Injectable()
export class Ga4MpService {
  private readonly logger = new Logger(Ga4MpService.name);

  async send(
    event: Event,
    credential: Ga4SendCredential,
  ): Promise<ForwarderResult> {
    const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(
      credential.measurementId,
    )}&api_secret=${encodeURIComponent(credential.apiSecret)}`;

    const name =
      EVENT_NAME_MAP[event.eventType] ??
      sanitizeCustomEventName(event.eventName);

    const params: Record<string, unknown> = { transaction_id: event.id };
    if (event.currency) params.currency = event.currency;
    if (event.value != null) params.value = Number(event.value);
    if (event.utmCampaign) params.campaign = event.utmCampaign;
    if (event.utmSource) params.source = event.utmSource;
    if (event.utmMedium) params.medium = event.utmMedium;
    if (event.sourceUrl) params.page_location = event.sourceUrl;
    if (event.referrerUrl) params.page_referrer = event.referrerUrl;

    const body = {
      client_id: event.visitorId,
      timestamp_micros: event.occurredAt.getTime() * 1000,
      non_personalized_ads: false,
      events: [{ name, params }],
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const responseBody = await response.text().catch(() => null);
        return {
          success: false,
          httpStatus: response.status,
          responseBody,
          errorMessage: `HTTP ${response.status}`,
        };
      }
      // GA4 Measurement Protocol returns 204 No Content on success.
      return { success: true, httpStatus: response.status };
    } catch (error) {
      this.logger.error(`GA4 MP request failed: ${(error as Error).message}`);
      return { success: false, errorMessage: (error as Error).message };
    } finally {
      clearTimeout(timeout);
    }
  }
}
