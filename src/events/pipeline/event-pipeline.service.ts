import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Project } from '../../../generated/prisma/client';
import type { CreateEventDto } from '../dto/create-event.dto';
import {
  EmitDomainEventsStage,
  EnrichStage,
  ForwardStage,
  MetricsStage,
  NormalizeStage,
  PersistStage,
  ValidateStage,
} from './stages';
import {
  MiddlewareRegistry,
  type PipelineContext,
  type PipelineRequestMeta,
  type PipelineResponse,
  type PipelineStage,
} from './pipeline.types';

/**
 * Event Pipeline orchestrator (Sprint 4.1):
 *   Validate → Normalize → Enrich → Persist → EmitDomainEvents → Forward → Metrics
 *
 * Purely structural refactor of the former EventsService.createEventInternal —
 * behavior is identical (same short-circuits, same responses, same errors).
 * Middlewares (empty registry by default) can hook between stages; each
 * stage's duration is measured into ctx.timings (+ total).
 */
@Injectable()
export class EventPipelineService {
  readonly middlewares = new MiddlewareRegistry();
  private readonly stages: PipelineStage[];

  constructor(
    validate: ValidateStage,
    normalize: NormalizeStage,
    enrich: EnrichStage,
    persist: PersistStage,
    emitDomainEvents: EmitDomainEventsStage,
    forward: ForwardStage,
    metrics: MetricsStage,
  ) {
    this.stages = [
      validate,
      normalize,
      enrich,
      persist,
      emitDomainEvents,
      forward,
      metrics,
    ];
  }

  async run(
    project: Project,
    dto: CreateEventDto,
    meta: PipelineRequestMeta,
  ): Promise<PipelineResponse> {
    const startedAt = Date.now();
    const ctx: PipelineContext = {
      traceId: randomUUID(),
      requestId: meta.requestId,
      correlationId: meta.correlationId,
      project,
      dto,
      meta,
      processing: {
        validated: false,
        normalized: false,
        enriched: false,
        persisted: false,
        forwarded: false,
        metrics: false,
      },
      errors: [],
      timings: {},
    };

    for (const stage of this.stages) {
      if (ctx.response) break;
      const stageStart = Date.now();
      await this.middlewares.run(ctx, stage.name, () => stage.execute(ctx));
      ctx.timings[stage.name] = Date.now() - stageStart;
    }
    ctx.timings.total = Date.now() - startedAt;

    if (ctx.response) return ctx.response;

    // Success path: same response shape as before the refactor.
    const event = ctx.event;
    const decision = ctx.decision;
    return {
      id: event?.id,
      eventId: event?.eventId,
      status: 'accepted',
      visitorId: event?.visitorId,
      sessionId: event?.sessionId,
      isNewVisitor: decision?.isNewVisitor,
      isNewSession: decision?.isNewSession,
    };
  }
}
