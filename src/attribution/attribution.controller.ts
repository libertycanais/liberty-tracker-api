import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/jwt-payload.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AttributionRepository } from './attribution.repository';
import { AttributionService } from './attribution.service';

/**
 * Dashboard-ready, read-only attribution queries. The Next.js dashboard is
 * NOT changed in this sprint — these endpoints exist so it can consume real
 * data later without any backend work.
 */
@ApiTags('attribution')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/attribution')
export class AttributionController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: AttributionRepository,
    private readonly attributionService: AttributionService,
  ) {}

  private async assertOwnership(workspaceId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, workspaceId },
    });
    if (!project) throw new NotFoundException('Project not found');
  }

  @ApiOperation({ summary: 'Top campanhas por touchpoints na janela' })
  @Get('top-campaigns')
  async topCampaigns(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Query('days', new ParseIntPipe({ optional: true })) days?: number,
  ) {
    await this.assertOwnership(user.workspaceId, projectId);
    return this.repository.topCampaigns(projectId, days ?? 30);
  }

  @ApiOperation({ summary: 'Top fontes de tráfego' })
  @Get('top-sources')
  async topSources(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Query('days', new ParseIntPipe({ optional: true })) days?: number,
  ) {
    await this.assertOwnership(user.workspaceId, projectId);
    return this.repository.topSources(projectId, days ?? 30);
  }

  @ApiOperation({
    summary: 'Distribuição por canal (google_ads, social, direct...)',
  })
  @Get('channels')
  async channels(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Query('days', new ParseIntPipe({ optional: true })) days?: number,
  ) {
    await this.assertOwnership(user.workspaceId, projectId);
    return this.repository.channels(projectId, days ?? 30);
  }

  @ApiOperation({ summary: 'Visitantes duráveis (paginado)' })
  @Get('visitors')
  async visitors(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize?: number,
  ) {
    await this.assertOwnership(user.workspaceId, projectId);
    return this.repository.listVisitors(projectId, page ?? 1, pageSize ?? 25);
  }

  @ApiOperation({ summary: 'Resumo de visitantes/sessões/eventos na janela' })
  @Get('sessions')
  async sessions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Query('days', new ParseIntPipe({ optional: true })) days?: number,
  ) {
    await this.assertOwnership(user.workspaceId, projectId);
    return this.repository.sessionsSummary(projectId, days ?? 30);
  }

  @ApiOperation({
    summary: 'Conversões com o resultado de atribuição calculado',
  })
  @Get('conversions')
  async conversions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Query('days', new ParseIntPipe({ optional: true })) days?: number,
  ) {
    await this.assertOwnership(user.workspaceId, projectId);
    return this.repository.conversions(projectId, days ?? 30);
  }

  @ApiOperation({ summary: 'Funil por canal (touchpoints → conversões)' })
  @Get('funnels')
  async funnels(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Query('days', new ParseIntPipe({ optional: true })) days?: number,
  ) {
    await this.assertOwnership(user.workspaceId, projectId);
    const [channels, summary] = await Promise.all([
      this.repository.channels(projectId, days ?? 30),
      this.repository.sessionsSummary(projectId, days ?? 30),
    ]);
    return { summary, channels };
  }

  @ApiOperation({
    summary: 'Timeline completa de micro-eventos de um visitante',
  })
  @Get('timeline/:visitorId')
  async timeline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('visitorId') visitorId: string,
  ) {
    await this.assertOwnership(user.workspaceId, projectId);
    const events = await this.prisma.event.findMany({
      where: { projectId, visitorId },
      orderBy: { occurredAt: 'asc' },
      select: {
        eventName: true,
        eventType: true,
        occurredAt: true,
        sessionId: true,
        sourceUrl: true,
        utmCampaign: true,
        value: true,
      },
    });
    return { visitorId, events };
  }

  @ApiOperation({ summary: 'Touchpoints de atribuição + estado do visitante' })
  @Get('touchpoints/:visitorId')
  async touchpoints(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('visitorId') visitorId: string,
  ) {
    await this.assertOwnership(user.workspaceId, projectId);
    return this.attributionService.export(projectId, visitorId);
  }
}
