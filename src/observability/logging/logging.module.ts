import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { JsonLoggerService } from './json-logger.service';
import { LoggingInterceptor } from './logging.interceptor';

@Module({
  providers: [
    JsonLoggerService,
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
  exports: [JsonLoggerService],
})
export class LoggingModule {}
