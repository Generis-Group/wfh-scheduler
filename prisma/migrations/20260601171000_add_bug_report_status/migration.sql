-- CreateEnum
CREATE TYPE "BugReportStatus" AS ENUM ('OPEN', 'SOLVED');

-- AlterTable
ALTER TABLE "BugReport"
ADD COLUMN "status" "BugReportStatus" NOT NULL DEFAULT 'OPEN',
ADD COLUMN "solvedAt" TIMESTAMP(3),
ADD COLUMN "solvedById" TEXT;

-- CreateIndex
CREATE INDEX "BugReport_status_createdAt_idx" ON "BugReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "BugReport_solvedById_solvedAt_idx" ON "BugReport"("solvedById", "solvedAt");

-- AddForeignKey
ALTER TABLE "BugReport" ADD CONSTRAINT "BugReport_solvedById_fkey" FOREIGN KEY ("solvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
