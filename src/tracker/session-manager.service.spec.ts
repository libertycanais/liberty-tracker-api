import { SessionManagerService } from './session-manager.service';
import type { TrackerRepository } from './tracker.repository';

describe('SessionManagerService', () => {
  let repository: jest.Mocked<TrackerRepository>;
  let service: SessionManagerService;

  beforeEach(() => {
    repository = {
      getSessionHash: jest.fn(),
      setSessionHash: jest.fn(),
      touchSessionTtl: jest.fn(),
    } as unknown as jest.Mocked<TrackerRepository>;
    service = new SessionManagerService(repository);
  });

  it('mints a new session when no sessionId is provided', async () => {
    const result = await service.resolve(
      'project-1',
      'visitor-1',
      undefined,
      30,
    );

    expect(result.isNewSession).toBe(true);
    expect(result.sessionId).toHaveLength(36);
    expect(repository.setSessionHash).toHaveBeenCalledWith(
      'project-1',
      result.sessionId,
      expect.objectContaining({ visitorId: 'visitor-1' }),
      30 * 60,
    );
  });

  it('renews an existing, still-valid session for the same visitor', async () => {
    const startedAt = '2026-01-01T00:00:00.000Z';
    repository.getSessionHash.mockResolvedValue({
      visitorId: 'visitor-1',
      startedAt,
      lastActivityAt: '2026-01-01T00:05:00.000Z',
    });

    const result = await service.resolve(
      'project-1',
      'visitor-1',
      'session-abc',
      30,
    );

    expect(result.isNewSession).toBe(false);
    expect(result.sessionId).toBe('session-abc');
    expect(result.sessionStartedAt.toISOString()).toBe(startedAt);
    expect(repository.touchSessionTtl).toHaveBeenCalledWith(
      'project-1',
      'session-abc',
      30 * 60,
    );
  });

  it('recovers with a new session when the sessionId is unknown/expired', async () => {
    repository.getSessionHash.mockResolvedValue(null);

    const result = await service.resolve(
      'project-1',
      'visitor-1',
      'expired-session',
      30,
    );

    expect(result.isNewSession).toBe(true);
    expect(result.sessionId).not.toBe('expired-session');
  });

  it('recovers with a new session when the cached session belongs to a different visitor', async () => {
    repository.getSessionHash.mockResolvedValue({
      visitorId: 'someone-else',
      startedAt: '2026-01-01T00:00:00.000Z',
      lastActivityAt: '2026-01-01T00:00:00.000Z',
    });

    const result = await service.resolve(
      'project-1',
      'visitor-1',
      'hijacked-session',
      30,
    );

    expect(result.isNewSession).toBe(true);
    expect(result.sessionId).not.toBe('hijacked-session');
  });
});
