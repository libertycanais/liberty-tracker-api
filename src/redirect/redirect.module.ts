import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { RedirectController } from './redirect.controller';
import { RedirectService } from './redirect.service';

@Module({
  imports: [EventsModule],
  controllers: [RedirectController],
  providers: [RedirectService],
})
export class RedirectModule {}
