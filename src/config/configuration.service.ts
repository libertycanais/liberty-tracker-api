import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ConfigurationService {
  constructor(private readonly configService: ConfigService) {}

  get rateLimit() {
    return {
      defaultProjectLimitPerMinute: this.configService.get<number>(
        'DEFAULT_PROJECT_RATE_LIMIT_PER_MINUTE',
        120,
      ),
    };
  }

  get security() {
    return {
      bodyLimit: this.configService.get<string>('BODY_LIMIT', '100kb'),
      globalOriginWhitelist: this.parseWhitelist(
        this.configService.get<string>('GLOBAL_ORIGIN_WHITELIST', ''),
      ),
    };
  }

  get server() {
    return {
      port: this.configService.get<number>('PORT', 3001),
      corsOrigin: this.configService.getOrThrow<string>('CORS_ORIGIN'),
    };
  }

  private parseWhitelist(raw: string | undefined): string[] {
    if (!raw) return [];
    return raw
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
}
