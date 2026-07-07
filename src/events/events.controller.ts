import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { AuthenticatedUser } from '../auth/jwt-payload.type';
import { CurrentProject } from '../common/decorators/current-project.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ProjectApiKeyGuard } from '../common/guards/project-api-key.guard';
import type { RequestWithId } from '../observability/logging/request-id.middleware';
import { ProjectRateLimitGuard } from '../tracker/guards/project-rate-limit.guard';
import { TrackerService } from '../tracker/tracker.service';
import type { Project } from '../../generated/prisma/client';
import type {
  EventType,
  ForwardStatus,
  Platform,
} from '../../generated/prisma/enums';
import { CreateEventDto } from './dto/create-event.dto';
import { EventsService } from './events.service';

@ApiTags('events')
@Controller()
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly trackerService: TrackerService,
  ) {}

  @ApiSecurity('apiKey')
  @ApiOperation({
    summary: 'Ingestão de eventos (endpoint único do pipeline de tracking)',
    description:
      'Passa por Domain Validation, allow/block list, Visitor/Session Manager e Attribution Engine antes de gravar o Event e enfileirar o forwarding. Eventos HEARTBEAT só renovam a sessão e nunca geram uma linha em Event.',
  })
  @ApiResponse({
    status: 201,
    description: 'Evento aceito, ignorado (blocked) ou heartbeat processado',
  })
  @UseGuards(ProjectApiKeyGuard, ProjectRateLimitGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post('events')
  async create(
    @CurrentProject() project: Project,
    @Body() dto: CreateEventDto,
    @Req() req: RequestWithId,
  ) {
    await this.trackerService.assertDomainAllowed(project, req);

    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
      req.ip;
    return this.eventsService.createEvent(project, dto, {
      ip,
      userAgent: req.headers['user-agent'],
      correlationId: req.correlationId,
    });
  }

  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Lista eventos de um projeto, com filtros e paginação',
  })
  @UseGuards(JwtAuthGuard)
  @Get('projects/:projectId/events')
  findForProject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize?: number,
    @Query('eventType') eventType?: EventType,
    @Query('platform') platform?: Platform,
    @Query('forwardStatus') forwardStatus?: ForwardStatus,
  ) {
    return this.eventsService.findForProject(
      user.workspaceId,
      projectId,
      page ?? 1,
      pageSize ?? 25,
      { eventType, platform, forwardStatus },
    );
  }
}
