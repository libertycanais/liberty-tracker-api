import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JsonLoggerService } from '../observability/logging/json-logger.service';
import type {
  DomainEventName,
  DomainEventPayloadMap,
} from './domain-events.types';

/**
 * Thin, process-local pub/sub for internal domain events — decoupled from
 * BullMQ (which stays the mechanism for actual forwarding work). Publishing
 * both logs the event immediately (closing the observability loop) and
 * emits it via EventEmitter2 so future listeners (integrations, audit)
 * can subscribe with @OnEvent(...) without touching the publishers.
 */
@Injectable()
export class DomainEventsService {
  constructor(
    private readonly emitter: EventEmitter2,
    private readonly logger: JsonLoggerService,
  ) {}

  publish<K extends DomainEventName>(
    name: K,
    payload: DomainEventPayloadMap[K],
  ): void {
    this.logger.logStructured({ domainEvent: name, ...payload });
    this.emitter.emit(name, payload);
  }
}
