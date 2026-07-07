import type { NextFunction, Response } from 'express';
import {
  RequestIdMiddleware,
  type RequestWithId,
} from './request-id.middleware';

function makeResponse(): jest.Mocked<Response> {
  return { setHeader: jest.fn() } as unknown as jest.Mocked<Response>;
}

describe('RequestIdMiddleware', () => {
  let middleware: RequestIdMiddleware;
  let next: NextFunction;

  beforeEach(() => {
    middleware = new RequestIdMiddleware();
    next = jest.fn();
  });

  it('generates a fresh requestId on every call', () => {
    const req1 = { headers: {} } as RequestWithId;
    const req2 = { headers: {} } as RequestWithId;
    middleware.use(req1, makeResponse(), next);
    middleware.use(req2, makeResponse(), next);

    expect(req1.requestId).toBeDefined();
    expect(req2.requestId).toBeDefined();
    expect(req1.requestId).not.toBe(req2.requestId);
  });

  it('generates a new correlationId when no X-Correlation-ID header is present', () => {
    const req = { headers: {} } as RequestWithId;
    middleware.use(req, makeResponse(), next);
    expect(req.correlationId).toBeDefined();
    expect(req.correlationId).not.toBe(req.requestId);
  });

  it('reuses an incoming X-Correlation-ID header instead of generating a new one', () => {
    const req = {
      headers: { 'x-correlation-id': 'client-supplied-id' },
    } as unknown as RequestWithId;
    middleware.use(req, makeResponse(), next);
    expect(req.correlationId).toBe('client-supplied-id');
  });

  it('takes the first value when X-Correlation-ID is sent multiple times', () => {
    const req = {
      headers: { 'x-correlation-id': ['first-id', 'second-id'] },
    } as unknown as RequestWithId;
    middleware.use(req, makeResponse(), next);
    expect(req.correlationId).toBe('first-id');
  });

  it('echoes both ids back as response headers', () => {
    const req = { headers: {} } as RequestWithId;
    const res = makeResponse();
    middleware.use(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', req.requestId);
    expect(res.setHeader).toHaveBeenCalledWith(
      'x-correlation-id',
      req.correlationId,
    );
  });

  it('calls next() so the request continues down the middleware chain', () => {
    middleware.use({ headers: {} } as RequestWithId, makeResponse(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
