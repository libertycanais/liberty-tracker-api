import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

export interface RequestWithId extends Request {
  requestId: string;
  /**
   * Distinct from requestId: reused from the incoming X-Correlation-ID
   * header when present, so a single logical operation keeps the same id
   * across HTTP request -> BullMQ job -> forwarding, unlike requestId
   * which is always fresh per HTTP request.
   */
  correlationId: string;
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: RequestWithId, res: Response, next: NextFunction) {
    req.requestId = randomUUID();

    const incoming = req.headers['x-correlation-id'];
    req.correlationId =
      (Array.isArray(incoming) ? incoming[0] : incoming) || randomUUID();

    res.setHeader('x-request-id', req.requestId);
    res.setHeader('x-correlation-id', req.correlationId);
    next();
  }
}
