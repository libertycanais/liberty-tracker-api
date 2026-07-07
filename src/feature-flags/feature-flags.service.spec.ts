import type { ConfigService } from '@nestjs/config';
import { FeatureFlagsService } from './feature-flags.service';
import { FEATURE_FLAGS } from './feature-flags.types';

describe('FeatureFlagsService', () => {
  it('defaults a flag to true when unset', () => {
    const configService = {
      get: jest.fn((_key: string, fallback: boolean) => fallback),
    } as unknown as jest.Mocked<ConfigService>;
    const service = new FeatureFlagsService(configService);

    expect(service.isEnabled(FEATURE_FLAGS.GOOGLE_ADS)).toBe(true);
  });

  it('reflects an explicitly disabled flag', () => {
    const configService = {
      get: jest.fn(() => false),
    } as unknown as jest.Mocked<ConfigService>;
    const service = new FeatureFlagsService(configService);

    expect(service.isEnabled(FEATURE_FLAGS.SWAGGER)).toBe(false);
  });

  it('reads each flag by its own env var name', () => {
    const configService = {
      get: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;
    const service = new FeatureFlagsService(configService);

    service.isEnabled(FEATURE_FLAGS.WEBHOOKS);
    expect(configService.get).toHaveBeenCalledWith('ENABLE_WEBHOOKS', true);
  });
});
