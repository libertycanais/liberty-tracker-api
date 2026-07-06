import { randomUUID } from 'crypto';
import { ATTRIBUTION_FIELDS } from './tracker.constants';
import type { AttributionData } from './tracker.types';

export function hostnameOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

export function isDomainAllowed(
  originHost: string | null,
  allowedDomains: string[],
): boolean {
  if (!originHost) return true;
  if (allowedDomains.length === 0) return true;
  return allowedDomains.includes(originHost);
}

export function generateSessionId(): string {
  return randomUUID();
}

export function pickAttribution(source: {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  fbclid?: string;
  gclid?: string;
}): AttributionData {
  const result: AttributionData = {};
  for (const field of ATTRIBUTION_FIELDS) {
    const value = source[field];
    if (value) {
      result[field] = value;
    }
  }
  return result;
}
