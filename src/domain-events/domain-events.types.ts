export const DOMAIN_EVENTS = {
  EVENT_RECEIVED: 'EventReceived',
  SESSION_STARTED: 'SessionStarted',
  VISITOR_CREATED: 'VisitorCreated',
  VISITOR_RETURNED: 'VisitorReturned',
  FORWARD_STARTED: 'ForwardStarted',
  FORWARD_SUCCEEDED: 'ForwardSucceeded',
  FORWARD_FAILED: 'ForwardFailed',
  TRACKER_CONFIGURED: 'TrackerConfigured',
  HEARTBEAT_RECEIVED: 'HeartbeatReceived',
} as const;

export type DomainEventName =
  (typeof DOMAIN_EVENTS)[keyof typeof DOMAIN_EVENTS];

export interface DomainEventPayloadMap {
  EventReceived: {
    correlationId: string;
    projectId: string;
    eventId: string;
    eventType: string;
    eventName: string;
  };
  SessionStarted: {
    correlationId: string;
    projectId: string;
    visitorId: string;
    sessionId: string;
  };
  VisitorCreated: {
    correlationId: string;
    projectId: string;
    visitorId: string;
  };
  VisitorReturned: {
    correlationId: string;
    projectId: string;
    visitorId: string;
  };
  ForwardStarted: {
    correlationId: string;
    projectId: string;
    eventId: string;
    platform: string;
  };
  ForwardSucceeded: {
    correlationId: string;
    projectId: string;
    eventId: string;
    platform: string;
  };
  ForwardFailed: {
    correlationId: string;
    projectId: string;
    eventId: string;
    platform: string;
    errorMessage?: string;
  };
  TrackerConfigured: {
    correlationId?: string;
    workspaceId: string;
    projectId: string;
  };
  HeartbeatReceived: {
    correlationId: string;
    projectId: string;
    visitorId: string;
    sessionId: string;
  };
}
