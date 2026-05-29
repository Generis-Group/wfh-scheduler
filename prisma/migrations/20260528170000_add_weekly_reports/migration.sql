CREATE TABLE "WeeklyReport" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "generatedById" TEXT,
    "weekStart" DATE NOT NULL,
    "weekEnd" DATE NOT NULL,
    "snapshot" JSONB NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "submittedCount" INTEGER NOT NULL DEFAULT 0,
    "activityCount" INTEGER NOT NULL DEFAULT 0,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WeeklyReport_employeeId_weekStart_key" ON "WeeklyReport"("employeeId", "weekStart");
CREATE INDEX "WeeklyReport_employeeId_generatedAt_idx" ON "WeeklyReport"("employeeId", "generatedAt");
CREATE INDEX "WeeklyReport_generatedById_generatedAt_idx" ON "WeeklyReport"("generatedById", "generatedAt");

ALTER TABLE "WeeklyReport" ADD CONSTRAINT "WeeklyReport_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WeeklyReport" ADD CONSTRAINT "WeeklyReport_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
