import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(() => {
    service = new MetricsService();
  });

  it('starts with all counters at zero', () => {
    const snapshot = service.snapshot();
    expect(snapshot.counters).toEqual({
      requestsTotal: 0,
      eventsIngested: 0,
      eventsBlocked: 0,
      eventsSkippedForwarding: 0,
      heartbeats: 0,
      sessionsCreated: 0,
      visitorsNew: 0,
      visitorsReturning: 0,
      queueJobsCompleted: 0,
      queueJobsFailed: 0,
      queueEnqueueFailures: 0,
      conversions: 0,
    });
    expect(snapshot.averages).toEqual({
      responseTimeMs: 0,
      processingTimeMs: 0,
      queueWaitTimeMs: 0,
      queueProcessingTimeMs: 0,
    });
  });

  it('increments counters independently', () => {
    service.incrementEventsIngested();
    service.incrementEventsIngested();
    service.incrementEventsBlocked();
    service.incrementHeartbeats();

    const { counters } = service.snapshot();
    expect(counters.eventsIngested).toBe(2);
    expect(counters.eventsBlocked).toBe(1);
    expect(counters.heartbeats).toBe(1);
    expect(counters.requestsTotal).toBe(0);
  });

  it('computes a running average for recorded timings', () => {
    service.recordResponseTime(100);
    service.recordResponseTime(200);
    service.recordResponseTime(300);

    expect(service.snapshot().averages.responseTimeMs).toBe(200);
  });

  it('keeps independent averages per timing category', () => {
    service.recordProcessingTime(10);
    service.recordQueueWaitTime(500);
    service.recordQueueProcessingTime(50);

    const { averages } = service.snapshot();
    expect(averages.processingTimeMs).toBe(10);
    expect(averages.queueWaitTimeMs).toBe(500);
    expect(averages.queueProcessingTimeMs).toBe(50);
    expect(averages.responseTimeMs).toBe(0);
  });

  it('reports non-negative rates and uptime', () => {
    service.incrementRequest();
    const { rates, uptimeSeconds } = service.snapshot();
    expect(rates.requestsPerMinute).toBeGreaterThanOrEqual(0);
    expect(uptimeSeconds).toBeGreaterThanOrEqual(0);
  });
});
