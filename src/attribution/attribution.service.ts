import { Injectable, Logger } from '@nestjs/common';
import type { Touchpoint, Visitor } from '../../generated/prisma/client';
import type {
  CanonicalCampaign,
  CanonicalGeo,
} from '../contracts/canonical.types';
import { DomainEventsService } from '../domain-events/domain-events.service';
import { MetricsService } from '../observability/metrics/metrics.service';
import type { ResolvedTrackerConfig } from '../tracker/tracker.types';
import { AttributionModelRegistry } from './attribution-model.registry';
import { AttributionRepository } from './attribution.repository';
import type {
  AttributionConfig,
  AttributionModelName,
  AttributionWeight,
} from './attribution.types';

/**
 * In-pipeline domain object (never persisted): everything a calculation
 * needs, assembled once instead of threading loose params around.
 */
export interface AttributionContext {
  projectId: string;
  visitorId: string;
  sessionId?: string;
  occurredAt: Date;
  eventName: string;
  eventType: string;
  isNewSession: boolean;
  campaign?: CanonicalCampaign;
  clickIds?: Record<string, string>;
  context?: Record<string, unknown>;
  geo?: CanonicalGeo | null;
  fingerprintHash?: string;
  fingerprintVersion?: number;
  value?: number;
  config: AttributionConfig;
  correlationId?: string;
}

export interface AttributionResult {
  model: AttributionModelName;
  windowDays: number;
  calculatedAt: string;
  conversionValue?: number;
  weights: AttributionWeight[];
  touchpointCount: number;
}

const CONVERSION_EVENT_TYPES = new Set(['PURCHASE', 'LEAD', 'SUBSCRIPTION']);

export function toAttributionConfig(
  resolved: ResolvedTrackerConfig,
): AttributionConfig {
  return {
    model: resolved.attributionModel as AttributionModelName,
    windowDays: resolved.attributionWindowDays,
    timeDecayHalfLifeDays: resolved.timeDecayHalfLifeDays,
    positionWeights: resolved.positionWeights,
  };
}

/**
 * Central attribution orchestration. Every public method is guarded: a
 * failure here degrades (log + metric) and NEVER breaks ingestion — the
 * platform-wide error policy.
 */
@Injectable()
export class AttributionService {
  private readonly logger = new Logger(AttributionService.name);

  constructor(
    private readonly repository: AttributionRepository,
    private readonly modelRegistry: AttributionModelRegistry,
    private readonly domainEvents: DomainEventsService,
    private readonly metricsService: MetricsService,
  ) {}

  /**
   * Ingestion-time enrichment: upsert the durable Visitor, keep click IDs
   * sticky, and append a Touchpoint when a new session/channel touch occurs.
   * Returns nothing the pipeline depends on — purely additive.
   */
  async resolve(ctx: AttributionContext): Promise<void> {
    try {
      let clickIds = ctx.clickIds;
      if (clickIds && Object.keys(clickIds).length > 0) {
        clickIds = await this.repository.mergeClickIds(
          ctx.projectId,
          ctx.visitorId,
          clickIds,
        );
      }

      await this.repository.upsertVisitor({
        projectId: ctx.projectId,
        visitorId: ctx.visitorId,
        occurredAt: ctx.occurredAt,
        isNewSession: ctx.isNewSession,
        clickIds,
        campaign: ctx.campaign,
        context: ctx.context,
        geo: ctx.geo,
        fingerprintHash: ctx.fingerprintHash,
        fingerprintVersion: ctx.fingerprintVersion,
      });

      // A touchpoint is a channel touch, not one row per micro-event: we
      // append on session start (new journey step) and on conversions.
      const isConversion = CONVERSION_EVENT_TYPES.has(ctx.eventType);
      if (ctx.isNewSession || isConversion) {
        const touchpoint = await this.repository.appendTouchpoint({
          projectId: ctx.projectId,
          visitorId: ctx.visitorId,
          sessionId: ctx.sessionId,
          occurredAt: ctx.occurredAt,
          campaign: ctx.campaign,
          clickIds,
          eventType: ctx.eventType,
          eventName: ctx.eventName,
          isConversion,
          value: ctx.value,
        });
        this.domainEvents.publish('TouchpointRecorded', {
          correlationId: ctx.correlationId ?? ctx.visitorId,
          projectId: ctx.projectId,
          visitorId: ctx.visitorId,
          touchpointId: touchpoint.id,
          channel: touchpoint.channel ?? undefined,
          isConversion,
        });
      }

      if (isConversion) {
        await this.convert(ctx);
      }
    } catch (error) {
      this.logger.error(
        `Attribution resolve degraded for ${ctx.visitorId}: ${(error as Error).message}`,
      );
    }
  }

  /** Pure calculation over the visitor's touchpoints with the configured model+window. */
  async calculate(
    projectId: string,
    visitorId: string,
    conversionAt: Date,
    config: AttributionConfig,
    conversionValue?: number,
  ): Promise<AttributionResult> {
    const touchpoints = await this.repository.getTouchpoints(
      projectId,
      visitorId,
    );
    const model = this.modelRegistry.get(config.model);
    const effective = model.supports(config)
      ? model
      : this.modelRegistry.get('last-touch');

    const weights = effective.calculate(
      touchpoints
        .filter((tp) => !tp.isConversion)
        .map((tp) => ({
          id: tp.id,
          occurredAt: tp.occurredAt,
          isConversion: tp.isConversion,
        })),
      { occurredAt: conversionAt, value: conversionValue },
      config,
    );

    return {
      model: effective.name,
      windowDays: config.windowDays,
      calculatedAt: new Date().toISOString(),
      conversionValue,
      weights,
      touchpointCount: weights.length,
    };
  }

  /** Persist a calculated attribution onto the Visitor aggregate. */
  async assign(
    projectId: string,
    visitorId: string,
    result: AttributionResult,
    correlationId?: string,
  ): Promise<void> {
    await this.repository.saveAttribution(projectId, visitorId, result);
    this.domainEvents.publish('AttributionCalculated', {
      correlationId: correlationId ?? visitorId,
      projectId,
      visitorId,
      model: result.model,
      touchpointCount: result.touchpointCount,
    });
  }

  /** Mark a conversion, run calculate + assign, publish ConversionCreated. */
  async convert(ctx: AttributionContext): Promise<AttributionResult | null> {
    try {
      const result = await this.calculate(
        ctx.projectId,
        ctx.visitorId,
        ctx.occurredAt,
        ctx.config,
        ctx.value,
      );
      await this.repository.recordConversion(
        ctx.projectId,
        ctx.visitorId,
        ctx.occurredAt,
        ctx.value,
        result,
      );
      this.metricsService.incrementConversions();
      this.domainEvents.publish('ConversionCreated', {
        correlationId: ctx.correlationId ?? ctx.visitorId,
        projectId: ctx.projectId,
        visitorId: ctx.visitorId,
        eventName: ctx.eventName,
        value: ctx.value,
      });
      await this.assign(
        ctx.projectId,
        ctx.visitorId,
        result,
        ctx.correlationId,
      );
      return result;
    } catch (error) {
      this.logger.error(
        `Attribution convert degraded for ${ctx.visitorId}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  /** Filterable dump of a visitor's attribution state (timeline + result). */
  async export(
    projectId: string,
    visitorId: string,
  ): Promise<{ visitor: Visitor | null; touchpoints: Touchpoint[] }> {
    const [visitor, touchpoints] = await Promise.all([
      this.repository.getVisitor(projectId, visitorId),
      this.repository.getTouchpoints(projectId, visitorId),
    ]);
    return { visitor, touchpoints };
  }
}
