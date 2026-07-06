import { Module } from '@nestjs/common';
import { AttributionEngineService } from './attribution-engine.service';
import { SessionManagerService } from './session-manager.service';
import { TrackerController } from './tracker.controller';
import { TrackerRepository } from './tracker.repository';
import { TrackerService } from './tracker.service';
import { VisitorManagerService } from './visitor-manager.service';

@Module({
  controllers: [TrackerController],
  providers: [
    TrackerRepository,
    VisitorManagerService,
    SessionManagerService,
    AttributionEngineService,
    TrackerService,
  ],
  exports: [TrackerService],
})
export class TrackerModule {}
