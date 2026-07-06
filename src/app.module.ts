import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AnalyticsModule } from './analytics/analytics.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { envValidationSchema } from './config/env.validation';
import { CredentialsModule } from './credentials/credentials.module';
import { CryptoModule } from './crypto/crypto.module';
import { EventsModule } from './events/events.module';
import { ForwardingModule } from './forwarding/forwarding.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { RedirectModule } from './redirect/redirect.module';
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
    PrismaModule,
    CryptoModule,
    AuthModule,
    WorkspacesModule,
    ProjectsModule,
    CredentialsModule,
    ForwardingModule,
    EventsModule,
    RedirectModule,
    SnippetModule,
    AnalyticsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
