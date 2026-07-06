import { Injectable } from '@nestjs/common';
import { TrackerRepository } from './tracker.repository';
import { generateSessionId } from './tracker.utils';
import type { SessionState } from './tracker.types';

@Injectable()
export class SessionManagerService {
  constructor(private readonly repository: TrackerRepository) {}

  async resolve(
    projectId: string,
    visitorId: string,
    sessionId: string | undefined,
    timeoutMinutes: number,
  ): Promise<SessionState> {
    const ttlSeconds = timeoutMinutes * 60;

    if (sessionId) {
      const existing = await this.repository.getSessionHash(
        projectId,
        sessionId,
      );
      if (existing && existing.visitorId === visitorId) {
        await this.repository.touchSessionTtl(projectId, sessionId, ttlSeconds);
        return {
          sessionId,
          isNewSession: false,
          sessionStartedAt: new Date(existing.startedAt),
        };
      }
    }

    const newSessionId = generateSessionId();
    const now = new Date();
    await this.repository.setSessionHash(
      projectId,
      newSessionId,
      {
        visitorId,
        startedAt: now.toISOString(),
        lastActivityAt: now.toISOString(),
      },
      ttlSeconds,
    );
    return {
      sessionId: newSessionId,
      isNewSession: true,
      sessionStartedAt: now,
    };
  }
}
