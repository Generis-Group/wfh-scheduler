-- CreateEnum
CREATE TYPE "EmailRunTrigger" AS ENUM ('MANUAL', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "EmailRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "EmailRun" (
    "id" TEXT NOT NULL,
    "reportDate" DATE NOT NULL,
    "trigger" "EmailRunTrigger" NOT NULL,
    "status" "EmailRunStatus" NOT NULL DEFAULT 'RUNNING',
    "recipientEmails" TEXT[],
    "subject" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "errorMessage" TEXT,
    "filters" JSONB,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "EmailRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailRun_dedupeKey_key" ON "EmailRun"("dedupeKey");

-- CreateIndex
CREATE INDEX "EmailRun_reportDate_trigger_createdAt_idx" ON "EmailRun"("reportDate", "trigger", "createdAt");

-- CreateIndex
CREATE INDEX "EmailRun_status_createdAt_idx" ON "EmailRun"("status", "createdAt");
