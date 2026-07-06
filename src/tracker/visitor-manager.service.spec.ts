import { VisitorManagerService } from './visitor-manager.service';
import type { TrackerRepository } from './tracker.repository';

describe('VisitorManagerService', () => {
  let repository: jest.Mocked<TrackerRepository>;
  let service: VisitorManagerService;

  beforeEach(() => {
    repository = {
      getVisitorHash: jest.fn(),
      setVisitorHash: jest.fn(),
    } as unknown as jest.Mocked<TrackerRepository>;
    service = new VisitorManagerService(repository);
  });

  it('marks a visitor with no cached state as new', async () => {
    repository.getVisitorHash.mockResolvedValue(null);

    const result = await service.resolve('project-1', 'visitor-1');

    expect(result.isNewVisitor).toBe(true);
    expect(result.sessionCount).toBe(0);
    expect(repository.setVisitorHash).toHaveBeenCalledWith(
      'project-1',
      'visitor-1',
      expect.objectContaining({ sessionCount: 0 }),
    );
  });

  it('marks a visitor with cached state as returning and preserves firstSeenAt', async () => {
    const firstSeenAt = '2026-01-01T00:00:00.000Z';
    repository.getVisitorHash.mockResolvedValue({
      firstSeenAt,
      lastSeenAt: '2026-01-02T00:00:00.000Z',
      sessionCount: '3',
    });

    const result = await service.resolve('project-1', 'visitor-1');

    expect(result.isNewVisitor).toBe(false);
    expect(result.sessionCount).toBe(3);
    expect(result.firstSeenAt.toISOString()).toBe(firstSeenAt);
  });

  it('increments the session count for an existing visitor', async () => {
    repository.getVisitorHash.mockResolvedValue({
      firstSeenAt: '2026-01-01T00:00:00.000Z',
      lastSeenAt: '2026-01-02T00:00:00.000Z',
      sessionCount: '1',
    });

    await service.incrementSessionCount('project-1', 'visitor-1');

    expect(repository.setVisitorHash).toHaveBeenCalledWith(
      'project-1',
      'visitor-1',
      expect.objectContaining({ sessionCount: 2 }),
    );
  });

  it('does nothing when incrementing a visitor with no cached state', async () => {
    repository.getVisitorHash.mockResolvedValue(null);

    await service.incrementSessionCount('project-1', 'visitor-1');

    expect(repository.setVisitorHash).not.toHaveBeenCalled();
  });
});
