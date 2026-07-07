import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { BullMQHealthIndicator } from './indicators/bullmq.health-indicator';
import { RedisHealthIndicator } from './indicators/redis.health-indicator';

@Module({
  imports: [
    TerminusModule,
    BullModule.registerQueue({ name: 'event-forwarding' }),
  ],
  controllers: [HealthController],
  providers: [RedisHealthIndicator, BullMQHealthIndicator],
})
export class HealthModule {}
