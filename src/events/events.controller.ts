import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/jwt-payload.type';
import { CurrentProject } from '../common/decorators/current-project.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ProjectApiKeyGuard } from '../common/guards/project-api-key.guard';
import type { Project } from '../../generated/prisma/client';
import type {
  EventType,
  ForwardStatus,
  Platform,
} from '../../generated/prisma/enums';
import { CreateEventDto } from './dto/create-event.dto';
import { EventsService } from './events.service';

function hostnameOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

@Controller()
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @UseGuards(ProjectApiKeyGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post('events')
  async create(
    @CurrentProject() project: Project,
    @Body() dto: CreateEventDto,
    @Req() req: Request,
  ) {
    if (project.domain) {
      const originHost =
        hostnameOf(req.headers.origin) ?? hostnameOf(req.headers.referer);
      if (originHost && originHost !== project.domain) {
        throw new ForbiddenException('Origin does not match project domain');
      }
    }

    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
      req.ip;
    return this.eventsService.createEvent(project, dto, {
      ip,
      userAgent: req.headers['user-agent'],
    });
  }

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
