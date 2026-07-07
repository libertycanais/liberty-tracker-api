import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
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

const MAX_BATCH_SIZE = 50;

/**
 * Same options as the global pipe in main.ts — reused programmatically so
 * single-event AND batch items get byte-identical validation semantics.
 */
const eventValidationPipe = new ValidationPipe({
  whitelist: true,
  transform: true,
});

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
      'Aceita um evento único (CreateEventDto — payload legado, inalterado) OU um lote { events: CreateEventDto[] }. Passa por Domain Validation, allow/block list, Visitor/Session Manager e Attribution Engine antes de gravar o Event e enfileirar o forwarding. Eventos HEARTBEAT só renovam a sessão e nunca geram uma linha em Event.',
  })
  @ApiResponse({
    status: 201,
    description:
      'Evento aceito/ignorado/heartbeat — ou { count, results } para lote',
  })
  @UseGuards(ProjectApiKeyGuard, ProjectRateLimitGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post('events')
  async create(
    @CurrentProject() project: Project,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithId,
  ) {
    await this.trackerService.assertDomainAllowed(project, req);

    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
      req.ip;
    const meta = {
      ip,
      userAgent: req.headers['user-agent'],
      correlationId: req.correlationId,
      requestId: req.requestId,
      headers: req.headers as Record<string, string | string[] | undefined>,
    };

    // Batch: { events: [...] } — additive; the legacy single-event shape
    // takes the same validation and pipeline it always did.
    if (Array.isArray((body as { events?: unknown }).events)) {
      const rawEvents = (body as { events: unknown[] }).events;
      if (rawEvents.length === 0) {
        throw new BadRequestException('events must not be empty');
      }
      if (rawEvents.length > MAX_BATCH_SIZE) {
        throw new BadRequestException(
          `events must contain at most ${MAX_BATCH_SIZE} items`,
        );
      }
      const dtos = (await Promise.all(
        rawEvents.map((raw) =>
          eventValidationPipe.transform(raw, {
            type: 'body',
            metatype: CreateEventDto,
          }),
        ),
      )) as CreateEventDto[];
      return this.eventsService.createEvents(project, dtos, meta);
    }

    const dto = (await eventValidationPipe.transform(body, {
      type: 'body',
      metatype: CreateEventDto,
    })) as CreateEventDto;
    return this.eventsService.createEvent(project, dto, meta);
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
