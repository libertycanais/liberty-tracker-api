import { Global, Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { LoggingModule } from '../observability/logging/logging.module';
import { DomainEventsService } from './domain-events.service';

@Global()
@Module({
  imports: [EventEmitterModule.forRoot(), LoggingModule],
  providers: [DomainEventsService],
  exports: [DomainEventsService],
})
export class DomainEventsModule {}
