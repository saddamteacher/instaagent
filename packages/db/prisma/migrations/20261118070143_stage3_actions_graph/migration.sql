-- AlterTable
ALTER TABLE "InstagramAccount" ADD COLUMN     "graphConnectedAt" TIMESTAMP(3),
ADD COLUMN     "graphTokenEnc" TEXT,
ADD COLUMN     "graphTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "igUserId" TEXT,
ADD COLUMN     "lastActionAt" TIMESTAMP(3),
ADD COLUMN     "nextActionAfter" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "actionError" TEXT,
ADD COLUMN     "actionStartedAt" TIMESTAMP(3),
ADD COLUMN     "payload" JSONB;
