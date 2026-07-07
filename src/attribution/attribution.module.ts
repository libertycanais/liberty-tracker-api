import { Module } from '@nestjs/common';
import { AttributionModelRegistry } from './attribution-model.registry';
import { AttributionController } from './attribution.controller';
import { AttributionRepository } from './attribution.repository';
import { AttributionService } from './attribution.service';

@Module({
  controllers: [AttributionController],
  providers: [
    AttributionModelRegistry,
    AttributionRepository,
    AttributionService,
  ],
  exports: [AttributionService, AttributionModelRegistry],
})
export class AttributionModule {}
