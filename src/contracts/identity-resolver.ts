import type { CanonicalIdentity } from './canonical.types';

/**
 * Cross-Device Identity (Ad.7) — INTERFACE ONLY in this sprint.
 *
 * When user login exists (future sprint), a real resolver will merge
 * anonymousId/visitorId with userId/externalId/crmId. Until then the no-op
 * resolver passes identities through unchanged; only visitorId/anonymousId
 * are populated by the platform today.
 */
export interface IdentityResolver {
  resolve(identity: CanonicalIdentity): Promise<CanonicalIdentity>;
}

export class NoopIdentityResolver implements IdentityResolver {
  resolve(identity: CanonicalIdentity): Promise<CanonicalIdentity> {
    return Promise.resolve(identity);
  }
}
