import { Controller, Get, Header, Param, Req } from '@nestjs/common';
import type { Request } from 'express';
import { SnippetService } from './snippet.service';

@Controller('snippet')
export class SnippetController {
  constructor(private readonly snippetService: SnippetService) {}

  @Get(':projectId.js')
  @Header('Content-Type', 'application/javascript; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=300')
  get(
    @Param('projectId') projectId: string,
    @Req() req: Request,
  ): Promise<string> {
    const apiUrl = `${req.protocol}://${req.get('host')}`;
    return this.snippetService.generate(projectId, apiUrl);
  }
}
