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
  // Internal Event Bus (Sprint 4.1)
  EVENT_PERSISTED: 'EventPersisted',
  CONVERSION_CREATED: 'ConversionCreated',
  FORWARD_REQUESTED: 'ForwardRequested',
  ATTRIBUTION_CALCULATED: 'AttributionCalculated',
  TOUCHPOINT_RECORDED: 'TouchpointRecorded',
  PLUGIN_EXECUTED: 'PluginExecuted',
  METRICS_UPDATED: 'MetricsUpdated',
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
  EventPersisted: {
    correlationId: string;
    projectId: string;
    eventId: string;
    eventType: string;
    eventName: string;
  };
  ConversionCreated: {
    correlationId: string;
    projectId: string;
    visitorId: string;
    eventName: string;
    value?: number;
  };
  ForwardRequested: {
    correlationId: string;
    projectId: string;
    eventId: string;
  };
  AttributionCalculated: {
    correlationId: string;
    projectId: string;
    visitorId: string;
    model: string;
    touchpointCount: number;
  };
  TouchpointRecorded: {
    correlationId: string;
    projectId: string;
    visitorId: string;
    touchpointId: string;
    channel?: string;
    isConversion: boolean;
  };
  PluginExecuted: {
    correlationId: string;
    projectId?: string;
    plugin: string;
    success: boolean;
  };
  MetricsUpdated: {
    correlationId?: string;
    metric: string;
    value: number;
  };
}
