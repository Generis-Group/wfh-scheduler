import { describe, expect, it } from "vitest";

describe.runIf(process.env.TEST_DATABASE_URL)("report revisions", () => {
  it("keeps a revision when editing an already-submitted report", async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const { prisma } = await import("@/lib/prisma");
    const { getDailyReport, submitReport, updateReport } = await import("@/lib/services/reports");

    const user = await prisma.user.create({
      data: {
        email: `test-${Date.now()}@generis.com`,
        name: "Revision Test",
        status: "ACTIVE"
      }
    });

    const report = await getDailyReport(user.id, "2026-05-13");

    expect(report).toBeTruthy();

    await updateReport(report!.id, user.id, { summary: "Initial summary" });
    await submitReport(report!.id, user.id);
    const updated = await updateReport(report!.id, user.id, { summary: "Edited summary" });

    expect(updated?.revisions.length).toBeGreaterThan(0);

    await prisma.user.delete({ where: { id: user.id } });
  });
});
