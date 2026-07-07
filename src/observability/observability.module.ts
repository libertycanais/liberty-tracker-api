import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { LoggingModule } from './logging/logging.module';
import { MetricsModule } from './metrics/metrics.module';
import { VersionController } from './version/version.controller';

@Module({
  imports: [MetricsModule, HealthModule, LoggingModule],
  controllers: [VersionController],
})
export class ObservabilityModule {}
