import type { EventEmitter2 } from '@nestjs/event-emitter';
import { JsonLoggerService } from '../observability/logging/json-logger.service';
import { DomainEventsService } from './domain-events.service';

describe('DomainEventsService', () => {
  let emitter: jest.Mocked<EventEmitter2>;
  let logger: jest.Mocked<JsonLoggerService>;
  let service: DomainEventsService;

  beforeEach(() => {
    emitter = { emit: jest.fn() } as unknown as jest.Mocked<EventEmitter2>;
    logger = {
      logStructured: jest.fn(),
    } as unknown as jest.Mocked<JsonLoggerService>;
    service = new DomainEventsService(emitter, logger);
  });

  it('logs the event as structured JSON with the domainEvent name and payload', () => {
    service.publish('VisitorCreated', {
      correlationId: 'corr-1',
      projectId: 'project-1',
      visitorId: 'visitor-1',
    });

    expect(logger.logStructured).toHaveBeenCalledWith({
      domainEvent: 'VisitorCreated',
      correlationId: 'corr-1',
      projectId: 'project-1',
      visitorId: 'visitor-1',
    });
  });

  it('emits via EventEmitter2 so future listeners can subscribe', () => {
    const payload = {
      correlationId: 'corr-2',
      projectId: 'project-1',
      eventId: 'event-1',
      platform: 'META',
    };
    service.publish('ForwardStarted', payload);

    expect(emitter.emit).toHaveBeenCalledWith('ForwardStarted', payload);
  });
});
