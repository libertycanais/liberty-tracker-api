import { AttributionModelRegistry } from './attribution-model.registry';
import { AttributionRepository } from './attribution.repository';
import {
  AttributionService,
  type AttributionContext,
} from './attribution.service';
import { DEFAULT_ATTRIBUTION_CONFIG } from './attribution.types';
import { DomainEventsService } from '../domain-events/domain-events.service';
import { MetricsService } from '../observability/metrics/metrics.service';

const DAY = 24 * 60 * 60 * 1000;

function makeCtx(
  overrides: Partial<AttributionContext> = {},
): AttributionContext {
  return {
    projectId: 'project-1',
    visitorId: 'visitor-1',
    sessionId: 'session-1',
    occurredAt: new Date('2026-02-01T00:00:00.000Z'),
    eventName: 'PageView',
    eventType: 'PAGE_VIEW',
    isNewSession: true,
    campaign: { source: 'google', channel: 'google_ads' },
    clickIds: { gclid: 'abc' },
    config: { ...DEFAULT_ATTRIBUTION_CONFIG },
    ...overrides,
  };
}

describe('AttributionService', () => {
  let repository: jest.Mocked<AttributionRepository>;
  let domainEvents: jest.Mocked<DomainEventsService>;
  let metricsService: jest.Mocked<MetricsService>;
  let service: AttributionService;

  beforeEach(() => {
    repository = {
      upsertVisitor: jest.fn().mockResolvedValue({}),
      mergeClickIds: jest
        .fn()
        .mockImplementation(
          (_p: string, _v: string, incoming: Record<string, string>) =>
            Promise.resolve(incoming),
        ),
      appendTouchpoint: jest
        .fn()
        .mockResolvedValue({ id: 'tp-1', channel: 'google_ads' }),
      getTouchpoints: jest.fn().mockResolvedValue([]),
      recordConversion: jest.fn(),
      saveAttribution: jest.fn(),
      getVisitor: jest.fn(),
    } as unknown as jest.Mocked<AttributionRepository>;
    domainEvents = {
      publish: jest.fn(),
    } as unknown as jest.Mocked<DomainEventsService>;
    metricsService = {
      incrementConversions: jest.fn(),
    } as unknown as jest.Mocked<MetricsService>;

    service = new AttributionService(
      repository,
      new AttributionModelRegistry(),
      domainEvents,
      metricsService,
    );
  });

  it('upserts the visitor and appends a touchpoint on a new session', async () => {
    await service.resolve(makeCtx({ isNewSession: true }));

    expect(repository.upsertVisitor).toHaveBeenCalledWith(
      expect.objectContaining({ visitorId: 'visitor-1', isNewSession: true }),
    );
    expect(repository.appendTouchpoint).toHaveBeenCalledWith(
      expect.objectContaining({ isConversion: false }),
    );
    expect(domainEvents.publish).toHaveBeenCalledWith(
      'TouchpointRecorded',
      expect.objectContaining({ touchpointId: 'tp-1' }),
    );
  });

  it('does NOT append a touchpoint for a mid-session non-conversion event', async () => {
    await service.resolve(makeCtx({ isNewSession: false }));
    expect(repository.appendTouchpoint).not.toHaveBeenCalled();
  });

  it('keeps click IDs sticky by merging via the repository', async () => {
    (repository.mergeClickIds as jest.Mock).mockResolvedValue({
      gclid: 'old',
      fbclid: 'new',
    });
    await service.resolve(makeCtx({ clickIds: { fbclid: 'new' } }));
    expect(repository.upsertVisitor).toHaveBeenCalledWith(
      expect.objectContaining({ clickIds: { gclid: 'old', fbclid: 'new' } }),
    );
  });

  it('runs the full conversion flow (calculate → recordConversion → assign) for PURCHASE', async () => {
    const conversionAt = new Date('2026-02-01T00:00:00.000Z');
    (repository.getTouchpoints as jest.Mock).mockResolvedValue([
      {
        id: 'tp-a',
        occurredAt: new Date(conversionAt.getTime() - 5 * DAY),
        isConversion: false,
      },
      {
        id: 'tp-b',
        occurredAt: new Date(conversionAt.getTime() - 1 * DAY),
        isConversion: false,
      },
    ]);

    await service.resolve(
      makeCtx({
        eventType: 'PURCHASE',
        eventName: 'Purchase',
        occurredAt: conversionAt,
        isNewSession: false,
        value: 100,
      }),
    );

    expect(repository.recordConversion).toHaveBeenCalledWith(
      'project-1',
      'visitor-1',
      conversionAt,
      100,
      expect.objectContaining({ model: 'last-touch' }),
    );
    expect(repository.saveAttribution).toHaveBeenCalled();
    expect(metricsService.incrementConversions).toHaveBeenCalled();
    expect(domainEvents.publish).toHaveBeenCalledWith(
      'ConversionCreated',
      expect.objectContaining({ value: 100 }),
    );
    expect(domainEvents.publish).toHaveBeenCalledWith(
      'AttributionCalculated',
      expect.objectContaining({ model: 'last-touch' }),
    );
  });

  it('respects the configured model when calculating', async () => {
    const conversionAt = new Date('2026-02-01T00:00:00.000Z');
    (repository.getTouchpoints as jest.Mock).mockResolvedValue([
      {
        id: 'a',
        occurredAt: new Date(conversionAt.getTime() - 10 * DAY),
        isConversion: false,
      },
      {
        id: 'b',
        occurredAt: new Date(conversionAt.getTime() - 1 * DAY),
        isConversion: false,
      },
    ]);

    const result = await service.calculate(
      'project-1',
      'visitor-1',
      conversionAt,
      { ...DEFAULT_ATTRIBUTION_CONFIG, model: 'first-touch' },
    );

    expect(result.model).toBe('first-touch');
    expect(result.weights).toEqual([{ touchpointId: 'a', weight: 1 }]);
  });

  it('applies the attribution window during calculate', async () => {
    const conversionAt = new Date('2026-02-01T00:00:00.000Z');
    (repository.getTouchpoints as jest.Mock).mockResolvedValue([
      {
        id: 'stale',
        occurredAt: new Date(conversionAt.getTime() - 60 * DAY),
        isConversion: false,
      },
      {
        id: 'fresh',
        occurredAt: new Date(conversionAt.getTime() - 3 * DAY),
        isConversion: false,
      },
    ]);

    const result = await service.calculate(
      'project-1',
      'visitor-1',
      conversionAt,
      { ...DEFAULT_ATTRIBUTION_CONFIG, model: 'linear', windowDays: 30 },
    );

    expect(result.weights).toEqual([{ touchpointId: 'fresh', weight: 1 }]);
  });

  it('degrades (never throws) when the repository fails', async () => {
    (repository.upsertVisitor as jest.Mock).mockRejectedValue(
      new Error('db down'),
    );
    await expect(service.resolve(makeCtx())).resolves.toBeUndefined();
  });
});
