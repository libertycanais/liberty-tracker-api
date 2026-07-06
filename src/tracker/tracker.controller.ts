import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UpdateTrackerConfigDto } from './dto/update-tracker-config.dto';
import { TrackerService } from './tracker.service';

@ApiTags('tracker-config')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/tracker-config')
export class TrackerController {
  constructor(private readonly trackerService: TrackerService) {}

  @ApiOperation({
    summary:
      'Configuração efetiva do Tracker Engine para o projeto (com defaults aplicados)',
  })
  @Get()
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
  ) {
    return this.trackerService.getConfig(user.workspaceId, projectId);
  }

  @ApiOperation({
    summary:
      'Atualiza (parcialmente) a configuração do Tracker Engine do projeto',
  })
  @Patch()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() dto: UpdateTrackerConfigDto,
  ) {
    return this.trackerService.updateConfig(user.workspaceId, projectId, dto);
  }
}
