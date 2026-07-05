import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Event } from '../../../generated/prisma/client';
import { EncryptionService } from '../../crypto/encryption.service';
import { HashService } from '../../crypto/hash.service';
import type { ForwarderResult } from './forwarder.interface';
import { normalizeEmail, normalizePhone } from './pii-normalize';

export interface MetaSendCredential {
  pixelId: string;
  accessToken: string;
  testEventCode?: string;
}

@Injectable()
export class MetaCapiService {
  private readonly logger = new Logger(MetaCapiService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly encryptionService: EncryptionService,
    private readonly hashService: HashService,
  ) {}

  async send(
    event: Event,
    credential: MetaSendCredential,
  ): Promise<ForwarderResult> {
    const apiVersion = this.configService.get<string>(
      'META_API_VERSION',
      'v21.0',
    );
    const url = `https://graph.facebook.com/${apiVersion}/${credential.pixelId}/events`;

    const userData: Record<string, unknown> = {};
    if (event.ip) userData.client_ip_address = event.ip;
    if (event.userAgent) userData.client_user_agent = event.userAgent;
    if (event.emailEncrypted) {
      userData.em = [
        this.hashService.sha256Hex(
          normalizeEmail(this.encryptionService.decrypt(event.emailEncrypted)),
        ),
      ];
    }
    if (event.phoneEncrypted) {
      userData.ph = [
        this.hashService.sha256Hex(
          normalizePhone(this.encryptionService.decrypt(event.phoneEncrypted)),
        ),
      ];
    }
    if (event.externalId) {
      userData.external_id = [this.hashService.sha256Hex(event.externalId)];
    }

    const customData: Record<string, unknown> = {};
    if (event.currency) customData.currency = event.currency;
    if (event.value != null) customData.value = Number(event.value);

    const body = {
      data: [
        {
          event_name: event.eventName,
          event_time: Math.floor(event.occurredAt.getTime() / 1000),
          action_source: 'website',
          event_source_url: event.sourceUrl ?? undefined,
          event_id: event.eventId,
          user_data: userData,
          custom_data: Object.keys(customData).length ? customData : undefined,
        },
      ],
      access_token: credential.accessToken,
      ...(credential.testEventCode
        ? { test_event_code: credential.testEventCode }
        : {}),
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
      const responseBody: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const errorMessage =
          responseBody &&
          typeof responseBody === 'object' &&
          'error' in responseBody
            ? ((responseBody as { error?: { message?: string } }).error
                ?.message ?? `HTTP ${response.status}`)
            : `HTTP ${response.status}`;
        return {
          success: false,
          httpStatus: response.status,
          responseBody,
          errorMessage,
        };
      }
      return { success: true, httpStatus: response.status, responseBody };
    } catch (error) {
      this.logger.error(
        `Meta CAPI request failed: ${(error as Error).message}`,
      );
      return { success: false, errorMessage: (error as Error).message };
    } finally {
      clearTimeout(timeout);
    }
  }
}
