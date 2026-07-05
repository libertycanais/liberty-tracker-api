import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Project } from '../../../generated/prisma/client';
import { HashService } from '../../crypto/hash.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ProjectApiKeyGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hashService: HashService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { project: Project }>();
    const apiKey = request.headers['x-api-key'];
    if (!apiKey || typeof apiKey !== 'string') {
      throw new UnauthorizedException('Missing x-api-key header');
    }

    const apiKeyHash = this.hashService.sha256Hex(apiKey);
    const project = await this.prisma.project.findUnique({
      where: { apiKeyHash },
    });
    if (!project) {
      throw new UnauthorizedException('Invalid API key');
    }

    request.project = project;
    return true;
  }
}
