-- CreateEnum
CREATE TYPE "OAuthAuthorizationStatus" AS ENUM ('pending', 'approved', 'denied', 'used');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('pending', 'connected', 'needs_login', 'limited', 'disconnected');

-- CreateEnum
CREATE TYPE "PublishMode" AS ENUM ('chrome', 'graph_api');

-- CreateEnum
CREATE TYPE "AgentRole" AS ENUM ('copywriter', 'editor', 'smm', 'analyst', 'commenter', 'designer', 'scriptwriter', 'hashtagger', 'trendHunter');

-- CreateEnum
CREATE TYPE "AgentState" AS ENUM ('chill', 'meeting', 'toDesk', 'working');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('queued', 'in_progress', 'awaiting_approval', 'approved', 'rejected', 'done');

-- CreateEnum
CREATE TYPE "TaskKind" AS ENUM ('content', 'research', 'analysis', 'publish', 'comment_reply', 'dm', 'other');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('post', 'reel', 'carousel', 'story');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('draft', 'awaiting_approval', 'approved', 'published', 'rejected');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthClient" (
    "id" TEXT NOT NULL,
    "clientSecretHash" TEXT,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthAuthorization" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "codeChallenge" TEXT NOT NULL,
    "state" TEXT,
    "scopes" TEXT[],
    "resource" TEXT,
    "status" "OAuthAuthorizationStatus" NOT NULL DEFAULT 'pending',
    "userId" TEXT,
    "workspaceId" TEXT,
    "codeHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthAuthorization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthToken" (
    "id" TEXT NOT NULL,
    "accessTokenHash" TEXT NOT NULL,
    "refreshTokenHash" TEXT,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "scopes" TEXT[],
    "resource" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "refreshExpiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "activeAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstagramAccount" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "chromeProfile" TEXT,
    "status" "AccountStatus" NOT NULL DEFAULT 'pending',
    "publishMode" "PublishMode" NOT NULL DEFAULT 'chrome',
    "dailyLimits" JSONB NOT NULL,
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstagramAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "role" "AgentRole" NOT NULL,
    "slot" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "state" "AgentState" NOT NULL DEFAULT 'chill',
    "deskNo" INTEGER NOT NULL,
    "currentTaskId" TEXT,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT,
    "meetingId" TEXT,
    "agentId" TEXT,
    "contentItemId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "role" "AgentRole" NOT NULL,
    "kind" "TaskKind" NOT NULL DEFAULT 'content',
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "status" "TaskStatus" NOT NULL DEFAULT 'queued',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "result" JSONB,
    "approvalCode" TEXT,
    "reviewNote" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "accountId" TEXT,
    "summary" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentItem" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "taskId" TEXT,
    "type" "ContentType" NOT NULL,
    "caption" TEXT NOT NULL,
    "hashtags" TEXT[],
    "mediaUrl" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "status" "ContentStatus" NOT NULL DEFAULT 'draft',
    "permalink" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsSnapshot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "followers" INTEGER,
    "following" INTEGER,
    "posts" INTEGER,
    "reach" INTEGER,
    "impressions" INTEGER,
    "profileViews" INTEGER,
    "engagementRate" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'chrome',
    "raw" JSONB,

    CONSTRAINT "AnalyticsSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogEntry" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "agentId" TEXT,
    "tool" TEXT,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthAuthorization_codeHash_key" ON "OAuthAuthorization"("codeHash");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthToken_accessTokenHash_key" ON "OAuthToken"("accessTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthToken_refreshTokenHash_key" ON "OAuthToken"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "OAuthToken_userId_idx" ON "OAuthToken"("userId");

-- CreateIndex
CREATE INDEX "Workspace_ownerId_idx" ON "Workspace"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "InstagramAccount_workspaceId_username_key" ON "InstagramAccount"("workspaceId", "username");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_workspaceId_role_slot_key" ON "Agent"("workspaceId", "role", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_workspaceId_deskNo_key" ON "Agent"("workspaceId", "deskNo");

-- CreateIndex
CREATE INDEX "Task_workspaceId_status_idx" ON "Task"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "Task_accountId_kind_approvedAt_idx" ON "Task"("accountId", "kind", "approvedAt");

-- CreateIndex
CREATE INDEX "Meeting_workspaceId_endedAt_idx" ON "Meeting"("workspaceId", "endedAt");

-- CreateIndex
CREATE INDEX "ContentItem_workspaceId_scheduledAt_idx" ON "ContentItem"("workspaceId", "scheduledAt");

-- CreateIndex
CREATE INDEX "AnalyticsSnapshot_accountId_capturedAt_idx" ON "AnalyticsSnapshot"("accountId", "capturedAt");

-- CreateIndex
CREATE INDEX "LogEntry_workspaceId_createdAt_idx" ON "LogEntry"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthAuthorization" ADD CONSTRAINT "OAuthAuthorization_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OAuthClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthToken" ADD CONSTRAINT "OAuthToken_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OAuthClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthToken" ADD CONSTRAINT "OAuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramAccount" ADD CONSTRAINT "InstagramAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InstagramAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InstagramAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsSnapshot" ADD CONSTRAINT "AnalyticsSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsSnapshot" ADD CONSTRAINT "AnalyticsSnapshot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogEntry" ADD CONSTRAINT "LogEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
