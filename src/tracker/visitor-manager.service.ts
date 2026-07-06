import { Injectable } from '@nestjs/common';
import { TrackerRepository } from './tracker.repository';
import type { VisitorState } from './tracker.types';

@Injectable()
export class VisitorManagerService {
  constructor(private readonly repository: TrackerRepository) {}

  async resolve(projectId: string, visitorId: string): Promise<VisitorState> {
    const now = new Date();
    const existing = await this.repository.getVisitorHash(projectId, visitorId);

    if (existing) {
      await this.repository.setVisitorHash(projectId, visitorId, {
        firstSeenAt: existing.firstSeenAt,
        lastSeenAt: now.toISOString(),
        sessionCount: existing.sessionCount ?? '0',
      });
      return {
        isNewVisitor: false,
        firstSeenAt: new Date(existing.firstSeenAt),
        sessionCount: Number(existing.sessionCount ?? 0),
      };
    }

    await this.repository.setVisitorHash(projectId, visitorId, {
      firstSeenAt: now.toISOString(),
      lastSeenAt: now.toISOString(),
      sessionCount: 0,
    });
    return { isNewVisitor: true, firstSeenAt: now, sessionCount: 0 };
  }

  async incrementSessionCount(
    projectId: string,
    visitorId: string,
  ): Promise<void> {
    const existing = await this.repository.getVisitorHash(projectId, visitorId);
    if (!existing) return;
    await this.repository.setVisitorHash(projectId, visitorId, {
      firstSeenAt: existing.firstSeenAt,
      lastSeenAt: existing.lastSeenAt,
      sessionCount: Number(existing.sessionCount ?? 0) + 1,
    });
  }
}
