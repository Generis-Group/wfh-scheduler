CREATE TABLE "ReportReadReceipt" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportReadReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReportReadReceipt_reportId_reviewerId_key" ON "ReportReadReceipt"("reportId", "reviewerId");

CREATE INDEX "ReportReadReceipt_reviewerId_readAt_idx" ON "ReportReadReceipt"("reviewerId", "readAt");

ALTER TABLE "ReportReadReceipt" ADD CONSTRAINT "ReportReadReceipt_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "DailyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReportReadReceipt" ADD CONSTRAINT "ReportReadReceipt_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
