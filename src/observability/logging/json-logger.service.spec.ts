import { JsonLoggerService } from './json-logger.service';

describe('JsonLoggerService', () => {
  let service: JsonLoggerService;
  let writeSpy: jest.SpyInstance;

  beforeEach(() => {
    service = new JsonLoggerService();
    writeSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  function lastLine(): Record<string, unknown> {
    const calls = writeSpy.mock.calls as unknown as string[][];
    const raw = calls[calls.length - 1][0];
    return JSON.parse(raw.trimEnd()) as Record<string, unknown>;
  }

  it('emits a single JSON line per structured log entry', () => {
    service.logStructured({ requestId: 'r1', statusCode: 200 });
    expect(writeSpy).toHaveBeenCalledTimes(1);
    const entry = lastLine();
    expect(entry.requestId).toBe('r1');
    expect(entry.statusCode).toBe(200);
    expect(typeof entry.timestamp).toBe('string');
  });

  it('omits keys whose value is undefined instead of emitting them as null', () => {
    service.logStructured({
      requestId: 'r1',
      visitorId: undefined,
      sessionId: 's1',
    });
    const entry = lastLine();
    expect(entry).not.toHaveProperty('visitorId');
    expect(entry.sessionId).toBe('s1');
  });

  it('serializes standard log() calls as JSON with level and message', () => {
    service.log('hello world', 'SomeContext');
    const entry = lastLine();
    expect(entry.level).toBe('log');
    expect(entry.message).toBe('hello world');
    expect(entry.context).toBe('SomeContext');
  });
});
