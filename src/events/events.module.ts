import { Module } from '@nestjs/common';
import { AttributionModule } from '../attribution/attribution.module';
import { ForwardingModule } from '../forwarding/forwarding.module';
import { TrackerModule } from '../tracker/tracker.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { EventPipelineService } from './pipeline/event-pipeline.service';
import {
  EmitDomainEventsStage,
  EnrichStage,
  ForwardStage,
  MetricsStage,
  NormalizeStage,
  PersistStage,
  ValidateStage,
} from './pipeline/stages';

@Module({
  imports: [ForwardingModule, TrackerModule, AttributionModule],
  controllers: [EventsController],
  providers: [
    EventsService,
    EventPipelineService,
    ValidateStage,
    NormalizeStage,
    EnrichStage,
    PersistStage,
    EmitDomainEventsStage,
    ForwardStage,
    MetricsStage,
  ],
  exports: [EventsService],
})
export class EventsModule {}
