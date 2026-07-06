-- AlterEnum
ALTER TYPE "EventType" ADD VALUE 'HEARTBEAT';

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "isNewSession" BOOLEAN,
ADD COLUMN     "isNewVisitor" BOOLEAN,
ADD COLUMN     "sessionStartedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "trackerConfig" JSONB;
