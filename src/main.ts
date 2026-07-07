import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ConfigurationService } from './config/configuration.service';
import { resolveCorsOrigin } from './config/cors-origin.policy';
import { JsonLoggerService } from './observability/logging/json-logger.service';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  const configService = app.get(ConfigService);
  const configurationService = app.get(ConfigurationService);

  app.useLogger(app.get(JsonLoggerService));

  app.use(helmet());

  // CORS is not the security boundary for this API — see
  // cors-origin.policy.ts and docs/SECURITY.md for the full reasoning.
  app.enableCors({
    origin: resolveCorsOrigin(
      configurationService.security.globalOriginWhitelist,
    ),
    credentials: false,
  });

  const bodyLimit = configurationService.security.bodyLimit;
  app.useBodyParser('json', { limit: bodyLimit });
  app.useBodyParser('urlencoded', { limit: bodyLimit, extended: true });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());

  if (configService.get<boolean>('ENABLE_SWAGGER', true)) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Liberty Tracker API')
      .setDescription(
        'Ingestão de eventos, Tracker Engine (visitor/session/attribution) e reenvio para plataformas de anúncio.',
      )
      .setVersion('0.1.0')
      .addBearerAuth()
      .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'apiKey')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  const port = configService.get<number>('PORT', 3001);
  await app.listen(port);
}
void bootstrap();
