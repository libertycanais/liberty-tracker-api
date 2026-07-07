import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '../../../generated/prisma/client';
import type { Event } from '../../../generated/prisma/client';
import {
  AttributionService,
  toAttributionConfig,
} from '../../attribution/attribution.service';
import type {
  CanonicalCampaign,
  CanonicalEvent,
} from '../../contracts/canonical.types';
import { EncryptionService } from '../../crypto/encryption.service';
import { DomainEventsService } from '../../domain-events/domain-events.service';
import { ForwardingService } from '../../forwarding/forwarding.service';
import { GeolocationService } from '../../geolocation/geolocation.service';
import {
  createDefaultNormalizerPipeline,
  NormalizerPipeline,
} from '../../normalization/normalization.engine';
import { MetricsService } from '../../observability/metrics/metrics.service';
import { PrismaService } from '../../prisma/prisma.service';
import { classifyChannel } from '../../snippet/sdk/sdk.helpers';
import { resolveTrackerConfig } from '../../tracker/entities/tracker-config.entity';
import { TrackerService } from '../../tracker/tracker.service';
import type { TrackerConfig } from '../../tracker/tracker.types';
import {
  createDefaultValidationEngine,
  ValidationEngine,
} from '../../validation/validation.engine';
import type { CreateEventDto } from '../dto/create-event.dto';
import type { PipelineContext, PipelineStage } from './pipeline.types';

const MAX_OCCURRED_AT_FUTURE_MS = 48 * 60 * 60 * 1000;
const MAX_OCCURRED_AT_PAST_MS = 90 * 24 * 60 * 60 * 1000;

const CLICK_ID_FIELDS = [
  'gclid',
  'gbraid',
  'wbraid',
  'fbclid',
  'ttclid',
  'msclkid',
  'twclid',
  'li_fat_id',
  'yclid',
  'dclid',
  'epik',
] as const;

function collectClickIds(dto: CreateEventDto): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of CLICK_ID_FIELDS) {
    const value = dto[key];
    if (value) out[key] = value;
  }
  return out;
}

function toCanonical(ctx: PipelineContext): CanonicalEvent {
  const dto = ctx.dto;
  const context = (dto.context ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  return {
    eventVersion: dto.eventVersion ?? 1,
    schemaVersion: dto.schemaVersion,
    sdkVersion: dto.sdkVersion,
    origin: 'browser',
    eventId: dto.eventId ?? '',
    eventName: dto.eventName,
    eventType: dto.eventType,
    occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
    identity: { visitorId: dto.visitorId, externalId: dto.externalId },
    sessionId: dto.sessionId,
    campaign: {
      source: dto.utmSource,
      medium: dto.utmMedium,
      campaign: dto.utmCampaign,
      term: dto.utmTerm,
      content: dto.utmContent,
      clickIds: collectClickIds(dto),
      landingPage:
        (context.page?.landingPage as string | undefined) ?? dto.sourceUrl,
      referrer: dto.referrerUrl,
    },
    context: {
      browser: context.browser,
      device: context.device,
      screen: context.screen,
      network: context.network,
      locale: context.locale,
      page: context.page,
      fingerprintHash: dto.fingerprintHash,
      fingerprintVersion: dto.fingerprintVersion,
    },
    value: dto.value,
    currency: dto.currency,
    metadata: dto.metadata,
  };
}

/**
 * Validate — runs the canonical ValidationEngine LOG-ONLY: violations are
 * recorded in ctx.errors, never thrown, so no payload accepted before this
 * sprint is ever rejected (100% behavior parity). The HTTP edge keeps
 * class-validator as-is.
 */
@Injectable()
export class ValidateStage implements PipelineStage {
  readonly name = 'validate';
  private readonly logger = new Logger(ValidateStage.name);
  private readonly engine: ValidationEngine = createDefaultValidationEngine();

  execute(ctx: PipelineContext): Promise<void> {
    const violations = this.engine.validate(toCanonical(ctx));
    if (violations.length > 0) {
      ctx.errors.push(...violations);
      this.logger.warn(
        `canonical validation: ${violations.length} violation(s) for event ${ctx.dto.eventId ?? '(new)'}`,
      );
    }
    ctx.processing.validated = true;
    return Promise.resolve();
  }
}

/** Normalize — DTO → CanonicalEvent through the registrable NormalizerPipeline. */
@Injectable()
export class NormalizeStage implements PipelineStage {
  readonly name = 'normalize';
  private readonly pipeline: NormalizerPipeline =
    createDefaultNormalizerPipeline();

  execute(ctx: PipelineContext): Promise<void> {
    ctx.canonicalEvent = this.pipeline.run(toCanonical(ctx));
    ctx.processing.normalized = true;
    return Promise.resolve();
  }
}

/**
 * Enrich — Tracker decision (blocked/heartbeat short-circuit, same responses
 * as before), geo resolution, and assembly of the AttributionContext that
 * Persist will hand to the AttributionService after a successful insert.
 */
@Injectable()
export class EnrichStage implements PipelineStage {
  readonly name = 'enrich';

  constructor(
    private readonly trackerService: TrackerService,
    private readonly geolocationService: GeolocationService,
  ) {}

  async execute(ctx: PipelineContext): Promise<void> {
    const decision = await this.trackerService.processIngestion(
      ctx.project,
      ctx.dto,
      ctx.correlationId,
    );

    if (decision.kind === 'blocked') {
      ctx.response = { status: 'ignored', reason: decision.reason };
      return;
    }
    if (decision.kind === 'heartbeat') {
      ctx.response = {
        status: 'ok',
        visitorId: ctx.dto.visitorId,
        sessionId: decision.sessionId,
        isNewSession: decision.isNewSession,
      };
      return;
    }
    ctx.decision = decision;

    ctx.geo = await this.geolocationService.resolve({
      ip: ctx.meta.ip,
      headers: ctx.meta.headers,
    });

    const resolved = resolveTrackerConfig(
      ctx.project.trackerConfig as TrackerConfig | null,
    );
    const clickIds = collectClickIds(ctx.dto);
    const campaign: CanonicalCampaign = {
      source: decision.attribution.utmSource,
      medium: decision.attribution.utmMedium,
      campaign: decision.attribution.utmCampaign,
      term: decision.attribution.utmTerm,
      content: decision.attribution.utmContent,
      channel: classifyChannel({
        clickIds,
        utms: {
          utm_source: decision.attribution.utmSource ?? '',
          utm_medium: decision.attribution.utmMedium ?? '',
        },
        referrer: ctx.dto.referrerUrl,
      }),
      clickIds,
      landingPage: ctx.canonicalEvent?.campaign?.landingPage,
      referrer: ctx.dto.referrerUrl,
    };

    ctx.attributionContext = {
      projectId: ctx.project.id,
      visitorId: ctx.dto.visitorId,
      sessionId: decision.sessionId,
      occurredAt: ctx.canonicalEvent?.occurredAt ?? new Date(),
      eventName: ctx.dto.eventName,
      eventType: ctx.dto.eventType,
      isNewSession: decision.isNewSession,
      campaign,
      clickIds,
      context: ctx.dto.context,
      geo: ctx.geo,
      fingerprintHash: ctx.dto.fingerprintHash,
      fingerprintVersion: ctx.dto.fingerprintVersion,
      value: ctx.dto.value,
      config: toAttributionConfig(resolved),
      correlationId: ctx.correlationId,
    };
    if (ctx.canonicalEvent) ctx.canonicalEvent.geo = ctx.geo ?? undefined;
    ctx.processing.enriched = true;
  }
}

/**
 * Persist — identical to the pre-pipeline implementation: occurredAt sanity
 * throw, idempotent upsert, P2002 race short-circuit. On success, triggers
 * the (guarded, additive) attribution resolve prepared by Enrich.
 */
@Injectable()
export class PersistStage implements PipelineStage {
  readonly name = 'persist';

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly attributionService: AttributionService,
  ) {}

  async execute(ctx: PipelineContext): Promise<void> {
    const decision = ctx.decision;
    if (!decision) return;
    const dto = ctx.dto;
    const eventId = dto.eventId ?? randomUUID();
    const occurredAt = this.resolveOccurredAt(dto.occurredAt);

    let event: Event;
    try {
      event = await this.prisma.event.upsert({
        where: {
          projectId_eventId: { projectId: ctx.project.id, eventId },
        },
        create: {
          projectId: ctx.project.id,
          visitorId: dto.visitorId,
          sessionId: decision.sessionId,
          eventName: dto.eventName,
          eventType: dto.eventType,
          eventId,
          occurredAt,
          sourceUrl: dto.sourceUrl,
          referrerUrl: dto.referrerUrl,
          utmSource: decision.attribution.utmSource,
          utmMedium: decision.attribution.utmMedium,
          utmCampaign: decision.attribution.utmCampaign,
          utmTerm: decision.attribution.utmTerm,
          utmContent: decision.attribution.utmContent,
          fbclid: decision.attribution.fbclid,
          gclid: decision.attribution.gclid,
          ip: ctx.meta.ip,
          userAgent: ctx.meta.userAgent,
          emailEncrypted: dto.email
            ? this.encryptionService.encrypt(dto.email)
            : undefined,
          phoneEncrypted: dto.phone
            ? this.encryptionService.encrypt(dto.phone)
            : undefined,
          externalId: dto.externalId,
          currency: dto.currency,
          value: dto.value,
          metadata: dto.metadata as never,
          isNewVisitor: decision.isNewVisitor,
          isNewSession: decision.isNewSession,
          sessionStartedAt: decision.sessionStartedAt,
        },
        update: {},
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Lost a P2002 race — the winning request already persisted,
        // forwarded and attributed this event. Same idempotent response,
        // nothing re-enqueued, no duplicate touchpoints.
        const existing = await this.prisma.event.findUniqueOrThrow({
          where: {
            projectId_eventId: { projectId: ctx.project.id, eventId },
          },
        });
        ctx.response = {
          id: existing.id,
          eventId: existing.eventId,
          status: 'accepted',
          visitorId: existing.visitorId,
          sessionId: existing.sessionId,
          isNewVisitor: decision.isNewVisitor,
          isNewSession: decision.isNewSession,
        };
        return;
      }
      throw error;
    }

    ctx.event = event;
    ctx.processing.persisted = true;

    // Additive attribution (guarded internally — never fails ingestion).
    if (ctx.attributionContext) {
      ctx.attributionContext.occurredAt = occurredAt;
      await this.attributionService.resolve(ctx.attributionContext);
    }
  }

  private resolveOccurredAt(raw: string | undefined): Date {
    if (!raw) return new Date();
    const parsed = new Date(raw);
    const now = Date.now();
    if (
      parsed.getTime() > now + MAX_OCCURRED_AT_FUTURE_MS ||
      parsed.getTime() < now - MAX_OCCURRED_AT_PAST_MS
    ) {
      throw new BadRequestException(
        'occurredAt is too far in the future or too far in the past',
      );
    }
    return parsed;
  }
}

/** EmitDomainEvents — right after a successful persist, before forwarding. */
@Injectable()
export class EmitDomainEventsStage implements PipelineStage {
  readonly name = 'emitDomainEvents';

  constructor(private readonly domainEvents: DomainEventsService) {}

  execute(ctx: PipelineContext): Promise<void> {
    const event = ctx.event;
    if (!event) return Promise.resolve();
    const correlationId = ctx.correlationId ?? event.id;
    this.domainEvents.publish('EventReceived', {
      correlationId,
      projectId: ctx.project.id,
      eventId: event.eventId,
      eventType: event.eventType,
      eventName: event.eventName,
    });
    this.domainEvents.publish('EventPersisted', {
      correlationId,
      projectId: ctx.project.id,
      eventId: event.eventId,
      eventType: event.eventType,
      eventName: event.eventName,
    });
    return Promise.resolve();
  }
}

/** Forward — enqueue BullMQ forwarding jobs (unchanged semantics). */
@Injectable()
export class ForwardStage implements PipelineStage {
  readonly name = 'forward';

  constructor(
    private readonly forwardingService: ForwardingService,
    private readonly domainEvents: DomainEventsService,
  ) {}

  async execute(ctx: PipelineContext): Promise<void> {
    const event = ctx.event;
    if (!event) return;
    this.domainEvents.publish('ForwardRequested', {
      correlationId: ctx.correlationId ?? event.id,
      projectId: ctx.project.id,
      eventId: event.eventId,
    });
    await this.forwardingService.enqueueForwards(
      event,
      ctx.project,
      ctx.correlationId,
    );
    ctx.processing.forwarded = true;
  }
}

/** Metrics — counters after the event fully went through. */
@Injectable()
export class MetricsStage implements PipelineStage {
  readonly name = 'metrics';

  constructor(private readonly metricsService: MetricsService) {}

  execute(ctx: PipelineContext): Promise<void> {
    if (!ctx.event) return Promise.resolve();
    this.metricsService.incrementEventsIngested();
    ctx.processing.metrics = true;
    return Promise.resolve();
  }
}
