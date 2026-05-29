-- CreateTable
CREATE TABLE "BugReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "pagePath" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BugReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BugReportAttachment" (
    "id" TEXT NOT NULL,
    "bugReportId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "dataUrl" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BugReportAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BugReport_createdAt_idx" ON "BugReport"("createdAt");

-- CreateIndex
CREATE INDEX "BugReport_reporterId_createdAt_idx" ON "BugReport"("reporterId", "createdAt");

-- CreateIndex
CREATE INDEX "BugReportAttachment_bugReportId_idx" ON "BugReportAttachment"("bugReportId");

-- AddForeignKey
ALTER TABLE "BugReport" ADD CONSTRAINT "BugReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BugReportAttachment" ADD CONSTRAINT "BugReportAttachment_bugReportId_fkey" FOREIGN KEY ("bugReportId") REFERENCES "BugReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
