import { HttpException, HttpStatus } from '@nestjs/common';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { MetricsService } from '../metrics/metrics.service';
import { JsonLoggerService } from './json-logger.service';
import { LoggingInterceptor } from './logging.interceptor';

function makeContext(request: Record<string, unknown>): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ statusCode: 201 }),
    }),
  } as unknown as ExecutionContext;
}

describe('LoggingInterceptor', () => {
  let logger: jest.Mocked<JsonLoggerService>;
  let metricsService: jest.Mocked<MetricsService>;
  let interceptor: LoggingInterceptor;

  beforeEach(() => {
    logger = {
      logStructured: jest.fn(),
    } as unknown as jest.Mocked<JsonLoggerService>;
    metricsService = {
      incrementRequest: jest.fn(),
      recordResponseTime: jest.fn(),
    } as unknown as jest.Mocked<MetricsService>;
    interceptor = new LoggingInterceptor(logger, metricsService);
  });

  it('logs a structured entry with requestId, correlationId and status on success', (done) => {
    const request = {
      requestId: 'req-1',
      correlationId: 'corr-1',
      method: 'POST',
      path: '/events',
      body: { visitorId: 'v1', sessionId: 's1', eventId: 'e1' },
      project: { id: 'project-1', workspaceId: 'workspace-1' },
    };
    const handler: CallHandler = { handle: () => of({ status: 'accepted' }) };

    interceptor.intercept(makeContext(request), handler).subscribe(() => {
      expect(metricsService.incrementRequest).toHaveBeenCalled();
      expect(logger.logStructured).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'req-1',
          correlationId: 'corr-1',
          workspaceId: 'workspace-1',
          projectId: 'project-1',
          visitorId: 'v1',
          sessionId: 's1',
          eventId: 'e1',
          endpoint: 'POST /events',
          statusCode: 201,
        }),
      );
      done();
    });
  });

  it('logs the real HTTP status of a thrown HttpException, not the default', (done) => {
    const request = {
      requestId: 'req-2',
      correlationId: 'corr-2',
      method: 'GET',
      path: '/x',
    };
    const handler: CallHandler = {
      handle: () =>
        throwError(() => new HttpException('nope', HttpStatus.FORBIDDEN)),
    };

    interceptor.intercept(makeContext(request), handler).subscribe({
      error: () => {
        expect(logger.logStructured).toHaveBeenCalledWith(
          expect.objectContaining({ statusCode: 403 }),
        );
        done();
      },
    });
  });

  it('passes through workspaceId from the JWT user when there is no project (dashboard routes)', (done) => {
    const request = {
      requestId: 'req-3',
      correlationId: 'corr-3',
      method: 'GET',
      path: '/health',
      user: { workspaceId: 'workspace-jwt' },
    };
    const handler: CallHandler = { handle: () => of({}) };

    interceptor.intercept(makeContext(request), handler).subscribe(() => {
      const logged = logger.logStructured.mock.calls[0][0];
      expect(logged.workspaceId).toBe('workspace-jwt');
      expect(logged.projectId).toBeUndefined();
      done();
    });
  });
});
