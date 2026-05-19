ALTER TABLE "ActivityItem" ADD COLUMN "staleAt" TIMESTAMP(3);

CREATE INDEX "ActivityItem_userId_reportDate_source_staleAt_idx" ON "ActivityItem"("userId", "reportDate", "source", "staleAt");
