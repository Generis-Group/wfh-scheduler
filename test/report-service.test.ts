import { describe, expect, it } from "vitest";

describe.runIf(process.env.TEST_DATABASE_URL)("report revisions", () => {
  it("keeps a revision when editing an already-submitted report", async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const { prisma } = await import("@/lib/prisma");
    const { ensureDailyReport, listReportHistory, submitReport, updateReport } = await import("@/lib/services/reports");

    const user = await prisma.user.create({
      data: {
        email: `test-${Date.now()}@generisgp.com`,
        name: "Revision Test",
        status: "ACTIVE"
      }
    });

    const report = await ensureDailyReport(user.id, "2026-05-13");

    expect(report).toBeTruthy();

    await updateReport(report!.id, user.id, { summary: "Initial summary" });
    await submitReport(report!.id, user.id);
    const updated = await updateReport(report!.id, user.id, { summary: "Edited summary" });
    const history = await listReportHistory(user.id);

    expect(updated?.revisions.length).toBeGreaterThan(0);
    expect(history[0]?.summary).toBe("Edited summary");
    expect(history[0]?.revisions.length).toBeGreaterThan(0);

    await prisma.user.delete({ where: { id: user.id } });
  });

  it("derives blockers from the summary and only hard-deletes manual work items", async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const { prisma } = await import("@/lib/prisma");
    const { ensureDailyReport, updateReport } = await import("@/lib/services/reports");

    const user = await prisma.user.create({
      data: {
        email: `cleanup-${Date.now()}@generisgp.com`,
        name: "Cleanup Test",
        status: "ACTIVE"
      }
    });
    const report = await ensureDailyReport(user.id, "2026-05-14");

    expect(report).toBeTruthy();

    const imported = await prisma.activityItem.create({
      data: {
        userId: user.id,
        dailyReportId: report!.id,
        reportDate: report!.reportDate,
        source: "JIRA",
        sourceId: `jira-${Date.now()}`,
        title: "Imported issue",
        selected: true
      }
    });
    const manual = await prisma.activityItem.create({
      data: {
        userId: user.id,
        dailyReportId: report!.id,
        reportDate: report!.reportDate,
        source: "MANUAL",
        sourceId: `manual-${Date.now()}`,
        title: "Manual note",
        selected: true
      }
    });

    const updated = await updateReport(report!.id, user.id, {
      summary: "Task: completed follow-up\nBlocker: waiting on approval",
      activityUpdates: [{ id: imported.id, selected: false }],
      deletedActivityIds: [imported.id, manual.id]
    });

    const importedAfter = await prisma.activityItem.findUnique({ where: { id: imported.id } });
    const manualAfter = await prisma.activityItem.findUnique({ where: { id: manual.id } });

    expect(updated?.blockers).toBe("waiting on approval");
    expect(importedAfter?.selected).toBe(false);
    expect(manualAfter).toBeNull();

    await prisma.user.delete({ where: { id: user.id } });
  });
});
