import type { HealthIndicatorService } from '@nestjs/terminus';
import type { Queue } from 'bullmq';
import { BullMQHealthIndicator } from './bullmq.health-indicator';

describe('BullMQHealthIndicator', () => {
  let up: jest.Mock;
  let down: jest.Mock;
  let healthIndicatorService: jest.Mocked<HealthIndicatorService>;
  let queue: jest.Mocked<Queue>;
  let indicator: BullMQHealthIndicator;

  beforeEach(() => {
    up = jest.fn().mockReturnValue({ bullmq: { status: 'up' } });
    down = jest.fn().mockReturnValue({ bullmq: { status: 'down' } });
    healthIndicatorService = {
      check: jest.fn().mockReturnValue({ up, down }),
    };
    queue = { getJobCounts: jest.fn() } as unknown as jest.Mocked<Queue>;
    indicator = new BullMQHealthIndicator(healthIndicatorService, queue);
  });

  it('reports up with job counts when the queue responds', async () => {
    queue.getJobCounts.mockResolvedValue({
      waiting: 2,
      completed: 10,
    });
    await indicator.pingCheck('bullmq');
    expect(up).toHaveBeenCalledWith({
      jobCounts: { waiting: 2, completed: 10 },
    });
  });

  it('reports down instead of throwing when the queue is unreachable', async () => {
    queue.getJobCounts.mockRejectedValue(new Error('Redis connection lost'));
    await expect(indicator.pingCheck('bullmq')).resolves.toBeDefined();
    expect(down).toHaveBeenCalledWith({ message: 'Redis connection lost' });
  });
});
