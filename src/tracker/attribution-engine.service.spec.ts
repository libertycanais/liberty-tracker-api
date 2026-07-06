import { AttributionEngineService } from './attribution-engine.service';
import type { TrackerRepository } from './tracker.repository';

describe('AttributionEngineService', () => {
  let repository: jest.Mocked<TrackerRepository>;
  let service: AttributionEngineService;

  beforeEach(() => {
    repository = {
      getAttribution: jest.fn(),
      setAttribution: jest.fn(),
    } as unknown as jest.Mocked<TrackerRepository>;
    service = new AttributionEngineService(repository);
  });

  it('caches and returns incoming attribution when present on the request', async () => {
    const result = await service.resolve('project-1', 'visitor-1', {
      utmSource: 'google',
      utmCampaign: 'summer-sale',
    });

    expect(result).toEqual({ utmSource: 'google', utmCampaign: 'summer-sale' });
    expect(repository.setAttribution).toHaveBeenCalledWith(
      'project-1',
      'visitor-1',
      {
        utmSource: 'google',
        utmCampaign: 'summer-sale',
      },
    );
    expect(repository.getAttribution).not.toHaveBeenCalled();
  });

  it('replaces the whole cached touch rather than merging field by field', async () => {
    await service.resolve('project-1', 'visitor-1', { gclid: 'new-click' });

    expect(repository.setAttribution).toHaveBeenCalledWith(
      'project-1',
      'visitor-1',
      {
        gclid: 'new-click',
      },
    );
  });

  it('falls back to the cached last-touch attribution when nothing is present on the request', async () => {
    repository.getAttribution.mockResolvedValue({
      utmSource: 'meta',
      fbclid: 'old-click',
    });

    const result = await service.resolve('project-1', 'visitor-1', {});

    expect(result).toEqual({ utmSource: 'meta', fbclid: 'old-click' });
    expect(repository.setAttribution).toHaveBeenCalledWith(
      'project-1',
      'visitor-1',
      {
        utmSource: 'meta',
        fbclid: 'old-click',
      },
    );
  });

  it('returns an empty object when there is no incoming or cached attribution', async () => {
    repository.getAttribution.mockResolvedValue(null);

    const result = await service.resolve('project-1', 'visitor-1', {});

    expect(result).toEqual({});
    expect(repository.setAttribution).not.toHaveBeenCalled();
  });
});
