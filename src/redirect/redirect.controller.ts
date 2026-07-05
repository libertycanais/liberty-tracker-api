import { Controller, Get, Param, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { RedirectService } from './redirect.service';

@Controller('r')
export class RedirectController {
  constructor(private readonly redirectService: RedirectService) {}

  @Get('wa/:projectId/:campaignSlug')
  async whatsappClick(
    @Param('projectId') projectId: string,
    @Param('campaignSlug') campaignSlug: string,
    @Query() query: Record<string, string>,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
      req.ip;
    const waUrl = await this.redirectService.logClickAndBuildWaUrl(
      projectId,
      campaignSlug,
      query,
      {
        ip,
        userAgent: req.headers['user-agent'],
      },
    );
    res.redirect(302, waUrl);
  }
}
