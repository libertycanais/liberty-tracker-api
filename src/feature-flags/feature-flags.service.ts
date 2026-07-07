import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FeatureFlag } from './feature-flags.types';

/**
 * Local, .env-backed feature flags — no external feature-flag platform.
 * Only ENABLE_SWAGGER actively gates anything today (see main.ts). The
 * remaining flags (ENABLE_GOOGLE_ADS, ENABLE_META_CAPI, ENABLE_GA4,
 * ENABLE_WEBHOOKS, ENABLE_TRACKER, ENABLE_FORWARDING, ENABLE_METRICS,
 * ENABLE_HEALTH) are readable and default to true — prepared for future
 * sprints to gate their respective modules without needing a new
 * mechanism, same "prepared but not yet connected" pattern as RolesGuard.
 */
@Injectable()
export class FeatureFlagsService {
  constructor(private readonly configService: ConfigService) {}

  isEnabled(flag: FeatureFlag): boolean {
    return this.configService.get<boolean>(flag, true);
  }
}
