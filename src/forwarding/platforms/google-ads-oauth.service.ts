import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

const REFRESH_MARGIN_MS = 60_000;

@Injectable()
export class GoogleAdsOAuthService {
  private readonly logger = new Logger(GoogleAdsOAuthService.name);
  private cached: CachedToken | null = null;

  constructor(private readonly configService: ConfigService) {}

  async getAccessToken(): Promise<string> {
    if (this.cached && this.cached.expiresAt - REFRESH_MARGIN_MS > Date.now()) {
      return this.cached.accessToken;
    }

    const clientId = this.configService.get<string>('GOOGLE_ADS_CLIENT_ID');
    const clientSecret = this.configService.get<string>(
      'GOOGLE_ADS_CLIENT_SECRET',
    );
    const refreshToken = this.configService.get<string>(
      'GOOGLE_ADS_REFRESH_TOKEN',
    );

    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error(
        'Google Ads não configurado neste servidor (faltam credenciais OAuth)',
      );
    }

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    const responseBody: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        responseBody &&
        typeof responseBody === 'object' &&
        'error_description' in responseBody
          ? String(
              (responseBody as { error_description?: string })
                .error_description,
            )
          : `HTTP ${response.status}`;
      this.logger.error(
        `Failed to refresh Google Ads access token: ${message}`,
      );
      throw new Error(`Falha ao renovar token OAuth do Google Ads: ${message}`);
    }

    const { access_token: accessToken, expires_in: expiresIn } =
      responseBody as {
        access_token: string;
        expires_in: number;
      };

    this.cached = { accessToken, expiresAt: Date.now() + expiresIn * 1000 };
    return accessToken;
  }
}
