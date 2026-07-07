import { BullModule } from '@nestjs/bullmq';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AnalyticsModule } from './analytics/analytics.module';
import { AppController } from './app.controller';
import { AttributionModule } from './attribution/attribution.module';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ConfigurationModule } from './config/config.module';
import { envValidationSchema } from './config/env.validation';
import { CredentialsModule } from './credentials/credentials.module';
import { CryptoModule } from './crypto/crypto.module';
import { DomainEventsModule } from './domain-events/domain-events.module';
import { EventsModule } from './events/events.module';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module';
import { ForwardingModule } from './forwarding/forwarding.module';
import { GeolocationModule } from './geolocation/geolocation.module';
import { RequestIdMiddleware } from './observability/logging/request-id.middleware';
import { ObservabilityModule } from './observability/observability.module';
import { PluginsModule } from './plugins/plugins.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { RedirectModule } from './redirect/redirect.module';
import { RedisModule } from './redis/redis.module';
import { SnippetModule } from './snippet/snippet.module';
import { WorkspacesModule } from './workspaces/workspaces.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60000, limit: 60 }] }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: { url: configService.getOrThrow<string>('REDIS_URL') },
      }),
    }),
    ConfigurationModule,
    PrismaModule,
    RedisModule,
    CryptoModule,
    DomainEventsModule,
    FeatureFlagsModule,
    GeolocationModule,
    PluginsModule,
    AuthModule,
    WorkspacesModule,
    ProjectsModule,
    CredentialsModule,
    ForwardingModule,
    EventsModule,
    RedirectModule,
    SnippetModule,
    AnalyticsModule,
    AttributionModule,
    ObservabilityModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
