import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { MetricsService } from './metrics.service';

@ApiTags('metrics')
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @ApiOperation({
    summary:
      'Snapshot JSON de métricas da aplicação (contadores, taxas, médias)',
  })
  @Get()
  get() {
    return this.metricsService.snapshot();
  }
}
