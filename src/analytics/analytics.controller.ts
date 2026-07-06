import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('funnel')
  getFunnel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Query('days', new ParseIntPipe({ optional: true })) days?: number,
  ) {
    return this.analyticsService.getFunnel(
      user.workspaceId,
      projectId,
      days ?? 30,
    );
  }

  @Get('timeseries')
  getTimeseries(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Query('days', new ParseIntPipe({ optional: true })) days?: number,
  ) {
    return this.analyticsService.getTimeseries(
      user.workspaceId,
      projectId,
      days ?? 30,
    );
  }
}
