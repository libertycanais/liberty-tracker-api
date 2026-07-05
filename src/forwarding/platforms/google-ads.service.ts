import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Event } from '../../../generated/prisma/client';
import { EncryptionService } from '../../crypto/encryption.service';
import { HashService } from '../../crypto/hash.service';
import type { ForwarderResult } from './forwarder.interface';
import { GoogleAdsOAuthService } from './google-ads-oauth.service';
import { normalizeEmail, normalizePhone } from './pii-normalize';

export interface GoogleAdsSendCredential {
  customerId: string;
  conversionActionId: string;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function formatConversionDateTime(date: Date): string {
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}+00:00`
  );
}

@Injectable()
export class GoogleAdsService {
  private readonly logger = new Logger(GoogleAdsService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly encryptionService: EncryptionService,
    private readonly hashService: HashService,
    private readonly oauthService: GoogleAdsOAuthService,
  ) {}

  async send(
    event: Event,
    credential: GoogleAdsSendCredential,
  ): Promise<ForwarderResult> {
    const developerToken = this.configService.get<string>(
      'GOOGLE_ADS_DEVELOPER_TOKEN',
    );
    const loginCustomerId = this.configService.get<string>(
      'GOOGLE_ADS_LOGIN_CUSTOMER_ID',
    );
    if (!developerToken || !loginCustomerId) {
      return {
        success: false,
        errorMessage:
          'Google Ads não configurado neste servidor (falta developer token)',
      };
    }

    let accessToken: string;
    try {
      accessToken = await this.oauthService.getAccessToken();
    } catch (error) {
      return { success: false, errorMessage: (error as Error).message };
    }

    const apiVersion = this.configService.get<string>(
      'GOOGLE_ADS_API_VERSION',
      'v18',
    );
    const url = `https://googleads.googleapis.com/${apiVersion}/customers/${credential.customerId}:uploadClickConversions`;

    const userIdentifiers: Record<string, string>[] = [];
    if (event.emailEncrypted) {
      userIdentifiers.push({
        hashedEmail: this.hashService.sha256Hex(
          normalizeEmail(this.encryptionService.decrypt(event.emailEncrypted)),
        ),
      });
    }
    if (event.phoneEncrypted) {
      userIdentifiers.push({
        hashedPhoneNumber: this.hashService.sha256Hex(
          normalizePhone(this.encryptionService.decrypt(event.phoneEncrypted)),
        ),
      });
    }

    const conversion: Record<string, unknown> = {
      gclid: event.gclid,
      conversionAction: `customers/${credential.customerId}/conversionActions/${credential.conversionActionId}`,
      conversionDateTime: formatConversionDateTime(event.occurredAt),
      orderId: event.id,
    };
    if (event.currency) conversion.currencyCode = event.currency;
    if (event.value != null) conversion.conversionValue = Number(event.value);
    if (userIdentifiers.length) conversion.userIdentifiers = userIdentifiers;

    const body = { conversions: [conversion], partialFailure: true };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'developer-token': developerToken,
          'login-customer-id': loginCustomerId,
        },
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

      const partialFailureError =
        responseBody &&
        typeof responseBody === 'object' &&
        'partialFailureError' in responseBody
          ? (responseBody as { partialFailureError?: { message?: string } })
              .partialFailureError
          : undefined;

      if (partialFailureError) {
        return {
          success: false,
          httpStatus: response.status,
          responseBody,
          errorMessage:
            partialFailureError.message ??
            'Partial failure reported by Google Ads',
        };
      }

      return { success: true, httpStatus: response.status, responseBody };
    } catch (error) {
      this.logger.error(
        `Google Ads request failed: ${(error as Error).message}`,
      );
      return { success: false, errorMessage: (error as Error).message };
    } finally {
      clearTimeout(timeout);
    }
  }
}
