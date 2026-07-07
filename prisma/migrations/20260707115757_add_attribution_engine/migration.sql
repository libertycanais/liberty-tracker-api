-- CreateTable
CREATE TABLE "Visitor" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sessionCount" INTEGER NOT NULL DEFAULT 0,
    "eventCount" INTEGER NOT NULL DEFAULT 0,
    "clickIds" JSONB,
    "firstTouch" JSONB,
    "lastTouch" JSONB,
    "context" JSONB,
    "geo" JSONB,
    "fingerprintHash" TEXT,
    "fingerprintVersion" INTEGER,
    "convertedAt" TIMESTAMP(3),
    "conversionCount" INTEGER NOT NULL DEFAULT 0,
    "conversionValue" DECIMAL(14,2),
    "attribution" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Visitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Touchpoint" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "sessionId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "position" INTEGER NOT NULL,
    "source" TEXT,
    "medium" TEXT,
    "campaign" TEXT,
    "content" TEXT,
    "term" TEXT,
    "channel" TEXT,
    "referrer" TEXT,
    "landingPage" TEXT,
    "clickIds" JSONB,
    "eventType" "EventType" NOT NULL,
    "eventName" TEXT NOT NULL,
    "isConversion" BOOLEAN NOT NULL DEFAULT false,
    "value" DECIMAL(14,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Touchpoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Visitor_projectId_lastSeenAt_idx" ON "Visitor"("projectId", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "Visitor_projectId_visitorId_key" ON "Visitor"("projectId", "visitorId");

-- CreateIndex
CREATE INDEX "Touchpoint_projectId_visitorId_occurredAt_idx" ON "Touchpoint"("projectId", "visitorId", "occurredAt");

-- AddForeignKey
ALTER TABLE "Visitor" ADD CONSTRAINT "Visitor_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Touchpoint" ADD CONSTRAINT "Touchpoint_projectId_visitorId_fkey" FOREIGN KEY ("projectId", "visitorId") REFERENCES "Visitor"("projectId", "visitorId") ON DELETE CASCADE ON UPDATE CASCADE;
