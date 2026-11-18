-- CreateEnum
CREATE TYPE "PlanId" AS ENUM ('free', 'pro', 'agency');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('payme', 'click');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('created', 'pending', 'paid', 'cancelled', 'failed');

-- CreateTable
CREATE TABLE "Subscription" (
    "workspaceId" TEXT NOT NULL,
    "plan" "PlanId" NOT NULL DEFAULT 'free',
    "currentPeriodEnd" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("workspaceId")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "plan" "PlanId" NOT NULL,
    "months" INTEGER NOT NULL DEFAULT 1,
    "amount" INTEGER NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'created',
    "providerTxnId" TEXT,
    "paymeTime" BIGINT,
    "paymeCreateTime" BIGINT,
    "paymePerformTime" BIGINT,
    "paymeCancelTime" BIGINT,
    "paymeState" INTEGER,
    "paymeReason" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_seq_key" ON "Payment"("seq");

-- CreateIndex
CREATE INDEX "Payment_workspaceId_createdAt_idx" ON "Payment"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_provider_providerTxnId_key" ON "Payment"("provider", "providerTxnId");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
