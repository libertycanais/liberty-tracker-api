import { Injectable } from '@nestjs/common';
import { TrackerRepository } from './tracker.repository';
import { pickAttribution } from './tracker.utils';
import type { AttributionData } from './tracker.types';

interface AttributionSource {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  fbclid?: string;
  gclid?: string;
}

@Injectable()
export class AttributionEngineService {
  constructor(private readonly repository: TrackerRepository) {}

  async resolve(
    projectId: string,
    visitorId: string,
    source: AttributionSource,
  ): Promise<AttributionData> {
    const incoming = pickAttribution(source);

    if (Object.keys(incoming).length > 0) {
      await this.repository.setAttribution(projectId, visitorId, incoming);
      return incoming;
    }

    const cached = await this.repository.getAttribution(projectId, visitorId);
    if (!cached) {
      return {};
    }
    // Refresh the sliding TTL on read so a returning visitor's last-touch
    // attribution stays alive as long as they keep coming back.
    await this.repository.setAttribution(projectId, visitorId, cached);
    return cached;
  }
}
