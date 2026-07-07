import { Injectable } from '@nestjs/common';
import { MapRegistry } from '../common/registry/registry';
import type {
  AttributionModel,
  AttributionModelName,
} from './attribution.types';
import { firstTouchModel } from './models/first-touch.model';
import { lastTouchModel } from './models/last-touch.model';
import { linearModel } from './models/linear.model';
import { positionBasedModel } from './models/position-based.model';
import { timeDecayModel } from './models/time-decay.model';
import { dataDrivenModel } from './models/data-driven.model';

/**
 * Registry-based factory for attribution models (refinement 8 — no switch).
 * New models (e.g. a trained data-driven model in Sprint 8) register here
 * without touching any caller.
 */
@Injectable()
export class AttributionModelRegistry {
  private readonly registry = new MapRegistry<AttributionModel>();

  constructor() {
    [
      firstTouchModel,
      lastTouchModel,
      linearModel,
      positionBasedModel,
      timeDecayModel,
      dataDrivenModel,
    ].forEach((model) => this.registry.register(model.name, model));
  }

  register(model: AttributionModel): void {
    this.registry.register(model.name, model);
  }

  /** Resolve a model by name, falling back to last-touch for unknown names. */
  get(name: AttributionModelName): AttributionModel {
    return (
      this.registry.get(name) ?? this.registry.get('last-touch') ?? linearModel
    );
  }

  list(): AttributionModel[] {
    return this.registry.list();
  }
}
