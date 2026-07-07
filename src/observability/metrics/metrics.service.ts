import { Injectable } from '@nestjs/common';

interface RunningAverage {
  count: number;
  totalMs: number;
}

function newAverage(): RunningAverage {
  return { count: 0, totalMs: 0 };
}

function average(acc: RunningAverage): number {
  return acc.count > 0 ? Math.round(acc.totalMs / acc.count) : 0;
}

@Injectable()
export class MetricsService {
  private readonly startedAt = Date.now();

  private readonly counters = {
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
  };

  private readonly responseTime = newAverage();
  private readonly processingTime = newAverage();
  private readonly queueWaitTime = newAverage();
  private readonly queueProcessingTime = newAverage();

  incrementRequest(): void {
    this.counters.requestsTotal++;
  }

  incrementEventsIngested(): void {
    this.counters.eventsIngested++;
  }

  incrementEventsBlocked(): void {
    this.counters.eventsBlocked++;
  }

  incrementEventsSkippedForwarding(): void {
    this.counters.eventsSkippedForwarding++;
  }

  incrementHeartbeats(): void {
    this.counters.heartbeats++;
  }

  incrementSessionsCreated(): void {
    this.counters.sessionsCreated++;
  }

  incrementVisitorsNew(): void {
    this.counters.visitorsNew++;
  }

  incrementVisitorsReturning(): void {
    this.counters.visitorsReturning++;
  }

  incrementQueueJobsCompleted(): void {
    this.counters.queueJobsCompleted++;
  }

  incrementQueueJobsFailed(): void {
    this.counters.queueJobsFailed++;
  }

  incrementQueueEnqueueFailures(): void {
    this.counters.queueEnqueueFailures++;
  }

  incrementConversions(): void {
    this.counters.conversions++;
  }

  recordResponseTime(ms: number): void {
    this.responseTime.count++;
    this.responseTime.totalMs += ms;
  }

  recordProcessingTime(ms: number): void {
    this.processingTime.count++;
    this.processingTime.totalMs += ms;
  }

  recordQueueWaitTime(ms: number): void {
    this.queueWaitTime.count++;
    this.queueWaitTime.totalMs += ms;
  }

  recordQueueProcessingTime(ms: number): void {
    this.queueProcessingTime.count++;
    this.queueProcessingTime.totalMs += ms;
  }

  /**
   * "Per minute" here is a cumulative average since process start
   * (total / minutes elapsed), not a trailing 60s window — simple and
   * honest, documented as such in docs/OBSERVABILITY.md.
   */
  snapshot() {
    const uptimeSeconds = (Date.now() - this.startedAt) / 1000;
    const uptimeMinutes = Math.max(uptimeSeconds / 60, 1 / 60);
    const perMinute = (n: number) =>
      Math.round((n / uptimeMinutes) * 100) / 100;

    return {
      uptimeSeconds: Math.round(uptimeSeconds),
      counters: { ...this.counters },
      rates: {
        requestsPerMinute: perMinute(this.counters.requestsTotal),
        eventsPerMinute: perMinute(this.counters.eventsIngested),
        visitorsPerMinute: perMinute(
          this.counters.visitorsNew + this.counters.visitorsReturning,
        ),
        sessionsPerMinute: perMinute(this.counters.sessionsCreated),
        conversionsPerMinute: perMinute(this.counters.conversions),
        conversionRate:
          this.counters.eventsIngested > 0
            ? Math.round(
                (this.counters.conversions / this.counters.eventsIngested) *
                  10000,
              ) / 10000
            : 0,
        retryRate:
          this.counters.queueJobsCompleted + this.counters.queueJobsFailed > 0
            ? Math.round(
                (this.counters.queueJobsFailed /
                  (this.counters.queueJobsCompleted +
                    this.counters.queueJobsFailed)) *
                  10000,
              ) / 10000
            : 0,
      },
      averages: {
        responseTimeMs: average(this.responseTime),
        processingTimeMs: average(this.processingTime),
        queueWaitTimeMs: average(this.queueWaitTime),
        queueProcessingTimeMs: average(this.queueProcessingTime),
      },
    };
  }
}
