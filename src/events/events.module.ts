import { Module } from '@nestjs/common';
import { ForwardingModule } from '../forwarding/forwarding.module';
import { TrackerModule } from '../tracker/tracker.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [ForwardingModule, TrackerModule],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
