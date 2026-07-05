import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { Project } from '../../../generated/prisma/client';

export const CurrentProject = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Project => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { project: Project }>();
    return request.project;
  },
);
