import type { AttributionData } from '../tracker.types';

export interface BlockedDecision {
  kind: 'blocked';
  reason: string;
}

export interface HeartbeatDecision {
  kind: 'heartbeat';
  sessionId: string;
  isNewSession: boolean;
}

export interface EventDecision {
  kind: 'event';
  sessionId: string;
  isNewVisitor: boolean;
  isNewSession: boolean;
  sessionStartedAt: Date;
  attribution: AttributionData;
}

export type IngestionDecision =
  BlockedDecision | HeartbeatDecision | EventDecision;
