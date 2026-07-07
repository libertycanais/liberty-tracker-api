import { Module } from '@nestjs/common';
import { AttributionEngineService } from './attribution-engine.service';
import { ProjectRateLimitGuard } from './guards/project-rate-limit.guard';
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
    ProjectRateLimitGuard,
  ],
  exports: [TrackerService, ProjectRateLimitGuard, TrackerRepository],
})
export class TrackerModule {}
