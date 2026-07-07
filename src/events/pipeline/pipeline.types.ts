import type { Event, Project } from '../../../generated/prisma/client';
import type { AttributionContext } from '../../attribution/attribution.service';
import type {
  CanonicalEvent,
  CanonicalGeo,
} from '../../contracts/canonical.types';
import type { RuleViolation } from '../../validation/validation.engine';
import type { EventDecision } from '../../tracker/interfaces/ingestion-decision.interface';
import type { CreateEventDto } from '../dto/create-event.dto';

export interface PipelineRequestMeta {
  ip?: string;
  userAgent?: string;
  correlationId?: string;
  requestId?: string;
  headers?: Record<string, string | string[] | undefined>;
}

/** What each stage may set to short-circuit the run (blocked/heartbeat/idempotent-replay). */
export type PipelineResponse = Record<string, unknown>;

/**
 * Single context object threaded through every stage (refinement 4).
 * Each stage mutates only its own slice; `processing` flags + per-stage
 * `timings` (and `timings.total`) are maintained by the orchestrator.
 */
export interface PipelineContext {
  traceId: string;
  requestId?: string;
  correlationId?: string;
  project: Project;
  dto: CreateEventDto;
  meta: PipelineRequestMeta;
  geo?: CanonicalGeo | null;
  canonicalEvent?: CanonicalEvent;
  decision?: EventDecision;
  attributionContext?: AttributionContext;
  event?: Event;
  /** Set by any stage to stop the pipeline and answer immediately. */
  response?: PipelineResponse;
  processing: {
    validated: boolean;
    normalized: boolean;
    enriched: boolean;
    persisted: boolean;
    forwarded: boolean;
    metrics: boolean;
  };
  errors: RuleViolation[];
  timings: Record<string, number>;
}

export interface PipelineStage {
  readonly name: string;
  execute(ctx: PipelineContext): Promise<void>;
}

export type PipelineMiddleware = (
  ctx: PipelineContext,
  stageName: string,
  next: () => Promise<void>,
) => Promise<void>;

/** Extension point (Ad.3): empty by default; future features hook between stages. */
export class MiddlewareRegistry {
  private readonly middlewares: PipelineMiddleware[] = [];

  use(middleware: PipelineMiddleware): void {
    this.middlewares.push(middleware);
  }

  list(): PipelineMiddleware[] {
    return [...this.middlewares];
  }

  clear(): void {
    this.middlewares.length = 0;
  }

  /** Compose registered middlewares around a stage execution. */
  async run(
    ctx: PipelineContext,
    stageName: string,
    stage: () => Promise<void>,
  ): Promise<void> {
    let index = -1;
    const chain = async (i: number): Promise<void> => {
      if (i <= index) throw new Error('next() called multiple times');
      index = i;
      if (i < this.middlewares.length) {
        await this.middlewares[i](ctx, stageName, () => chain(i + 1));
      } else {
        await stage();
      }
    };
    await chain(0);
  }
}
