-- CreateEnum
CREATE TYPE "CommandSource" AS ENUM ('web', 'voice');

-- CreateEnum
CREATE TYPE "CommandStatus" AS ENUM ('new', 'taken', 'done', 'dismissed');

-- AlterTable
ALTER TABLE "ContentItem" ADD COLUMN     "audioUrl" TEXT;

-- CreateTable
CREATE TABLE "Command" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "source" "CommandSource" NOT NULL DEFAULT 'web',
    "status" "CommandStatus" NOT NULL DEFAULT 'new',
    "accountId" TEXT,
    "meetingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "takenAt" TIMESTAMP(3),

    CONSTRAINT "Command_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Command_workspaceId_status_idx" ON "Command"("workspaceId", "status");

-- AddForeignKey
ALTER TABLE "Command" ADD CONSTRAINT "Command_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
