import type { CanonicalEvent } from '../contracts/canonical.types';

/**
 * Validation Engine (Sprint 4.1) — validates the CANONICAL event inside the
 * pipeline. It does NOT replace class-validator, which keeps validating the
 * HTTP DTO at the edge. Rules are pure and grouped into RuleSets so future
 * sprints extend them without spreading checks through the codebase.
 */
export interface RuleViolation {
  rule: string;
  field: string;
  message: string;
}

export type Rule = (event: CanonicalEvent) => RuleViolation | null;

export interface RuleSet {
  readonly name: string;
  readonly rules: Rule[];
}

// ---------- primitive rule factories ----------

export function required(
  field: string,
  get: (e: CanonicalEvent) => unknown,
): Rule {
  return (event) =>
    get(event) == null || get(event) === ''
      ? { rule: 'required', field, message: `${field} is required` }
      : null;
}

export function isString(
  field: string,
  get: (e: CanonicalEvent) => unknown,
): Rule {
  return (event) => {
    const v = get(event);
    return v != null && typeof v !== 'string'
      ? { rule: 'string', field, message: `${field} must be a string` }
      : null;
  };
}

export function isNumber(
  field: string,
  get: (e: CanonicalEvent) => unknown,
): Rule {
  return (event) => {
    const v = get(event);
    return v != null && (typeof v !== 'number' || Number.isNaN(v))
      ? { rule: 'number', field, message: `${field} must be a number` }
      : null;
  };
}

export function isUrl(
  field: string,
  get: (e: CanonicalEvent) => unknown,
): Rule {
  return (event) => {
    const v = get(event);
    if (v == null || v === '') return null;
    if (typeof v !== 'string') {
      return { rule: 'url', field, message: `${field} must be a valid URL` };
    }
    try {
      new URL(v);
      return null;
    } catch {
      return { rule: 'url', field, message: `${field} must be a valid URL` };
    }
  };
}

export function isUuidLike(
  field: string,
  get: (e: CanonicalEvent) => unknown,
): Rule {
  return (event) => {
    const v = get(event);
    if (v == null || v === '') return null;
    return typeof v === 'string' && /^[\w-]{8,}$/.test(v)
      ? null
      : { rule: 'uuid', field, message: `${field} must be an id-like string` };
  };
}

export function maxLen(
  field: string,
  limit: number,
  get: (e: CanonicalEvent) => unknown,
): Rule {
  return (event) => {
    const v = get(event);
    return typeof v === 'string' && v.length > limit
      ? { rule: 'maxLen', field, message: `${field} exceeds ${limit} chars` }
      : null;
  };
}

// ---------- rule sets ----------

export const IdentityRules: RuleSet = {
  name: 'identity',
  rules: [
    required('visitorId', (e) => e.identity?.visitorId),
    isUuidLike('visitorId', (e) => e.identity?.visitorId),
    // eventId is intentionally NOT required here — it's optional at ingest
    // and generated during Persist when absent.
    isUuidLike('eventId', (e) => e.eventId),
    required('eventName', (e) => e.eventName),
    required('eventType', (e) => e.eventType),
  ],
};

export const CampaignRules: RuleSet = {
  name: 'campaign',
  rules: [
    maxLen('campaign.source', 256, (e) => e.campaign?.source),
    maxLen('campaign.medium', 256, (e) => e.campaign?.medium),
    maxLen('campaign.campaign', 256, (e) => e.campaign?.campaign),
    isUrl('campaign.landingPage', (e) => e.campaign?.landingPage),
  ],
};

export const ClickIdRules: RuleSet = {
  name: 'clickid',
  rules: [
    (event) => {
      const clickIds = event.campaign?.clickIds ?? {};
      for (const [key, value] of Object.entries(clickIds)) {
        if (typeof value !== 'string' || value.length > 512) {
          return {
            rule: 'clickid',
            field: `clickIds.${key}`,
            message: `click id ${key} must be a string up to 512 chars`,
          };
        }
      }
      return null;
    },
  ],
};

export const ContextRules: RuleSet = {
  name: 'context',
  rules: [isNumber('value', (e) => e.value)],
};

export class ValidationEngine {
  private readonly ruleSets: RuleSet[] = [];

  register(ruleSet: RuleSet): void {
    this.ruleSets.push(ruleSet);
  }

  list(): RuleSet[] {
    return [...this.ruleSets];
  }

  validate(event: CanonicalEvent): RuleViolation[] {
    const violations: RuleViolation[] = [];
    for (const set of this.ruleSets) {
      for (const rule of set.rules) {
        const violation = rule(event);
        if (violation) violations.push(violation);
      }
    }
    return violations;
  }
}

export function createDefaultValidationEngine(): ValidationEngine {
  const engine = new ValidationEngine();
  engine.register(IdentityRules);
  engine.register(CampaignRules);
  engine.register(ClickIdRules);
  engine.register(ContextRules);
  return engine;
}
