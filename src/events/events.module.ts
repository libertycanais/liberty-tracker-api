import { Module } from '@nestjs/common';
import { ForwardingModule } from '../forwarding/forwarding.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [ForwardingModule],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
