import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MetricsService } from '../metrics/metrics.service';
import { JsonLoggerService } from './json-logger.service';
import type { RequestWithId } from './request-id.middleware';

interface RequestContext extends RequestWithId {
  project?: { id: string; workspaceId: string };
  user?: { workspaceId: string };
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(
    private readonly logger: JsonLoggerService,
    private readonly metricsService: MetricsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<RequestContext>();
    const response = httpContext.getResponse<Response>();
    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () => this.finish(request, response.statusCode, startedAt),
        error: (error: unknown) =>
          this.finish(request, this.statusOf(error), startedAt),
      }),
    );
  }

  private statusOf(error: unknown): number {
    return error instanceof HttpException ? error.getStatus() : 500;
  }

  private finish(
    request: RequestContext,
    statusCode: number,
    startedAt: number,
  ) {
    const latencyMs = Date.now() - startedAt;
    this.metricsService.incrementRequest();
    this.metricsService.recordResponseTime(latencyMs);

    const body = request.body as
      { visitorId?: string; sessionId?: string; eventId?: string } | undefined;

    this.logger.logStructured({
      requestId: request.requestId,
      correlationId: request.correlationId,
      workspaceId: request.user?.workspaceId ?? request.project?.workspaceId,
      projectId: request.project?.id,
      apiKeyId: request.project?.id,
      visitorId: body?.visitorId,
      sessionId: body?.sessionId,
      eventId: body?.eventId,
      endpoint: `${request.method} ${(request.route as { path?: string } | undefined)?.path ?? request.path}`,
      statusCode,
      latencyMs,
    });
  }
}
