import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { Ga4MpService } from './platforms/ga4-mp.service';
import { MetaCapiService } from './platforms/meta-capi.service';
import { EventForwardingProcessor } from './processors/event-forwarding.processor';
import { ForwardingService } from './forwarding.service';

@Module({
  imports: [BullModule.registerQueue({ name: 'event-forwarding' })],
  providers: [
    ForwardingService,
    EventForwardingProcessor,
    MetaCapiService,
    Ga4MpService,
  ],
  exports: [ForwardingService],
})
export class ForwardingModule {}
