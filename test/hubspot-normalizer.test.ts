import { describe, expect, it } from "vitest";

import type { HubSpotLoggedHoursConfig } from "@/lib/integrations/hubspot";
import { normalizeHubSpotLoggedHours } from "@/lib/normalizers/hubspot";

const baseConfig: HubSpotLoggedHoursConfig = {
  apiBaseUrl: "https://api.hubapi.com",
  crmApiVersion: "2026-03",
  token: "hubspot-token",
  objectType: "time_entries",
  dateProperty: "work_date",
  durationProperty: "hours",
  durationUnit: "hours",
  userEmailProperty: "user_email",
  titleProperties: ["task_name", "project_name"],
  descriptionProperties: ["notes"],
  pageLimit: 100,
  dateFilterFormat: "epochMillis",
};

describe("HubSpot logged-hours normalizer", () => {
  it("converts configured properties into a normalized activity", () => {
    const activity = normalizeHubSpotLoggedHours(
      {
        id: "123",
        properties: {
          work_date: "2026-06-18T15:00:00.000Z",
          hours: "2.25",
          task_name: "IT + Marketing sync follow-up",
          notes: "Prepared reporting suite options",
          user_email: "employee@generisgp.com",
        },
      },
      baseConfig,
    );

    expect(activity).toEqual(
      expect.objectContaining({
        source: "HUBSPOT",
        sourceId: "logged-hours:time_entries:123",
        title: "IT + Marketing sync follow-up",
        description: "Prepared reporting suite options",
        durationMinutes: 135,
        metadata: expect.objectContaining({
          hubSpotObjectId: "123",
          importedKind: "logged_hours",
        }),
      }),
    );
  });

  it("handles minute durations and epoch millisecond dates", () => {
    const activity = normalizeHubSpotLoggedHours(
      {
        id: "456",
        properties: {
          work_date: "1781712000000",
          hours: "45",
          task_name: "Client report clean-up",
        },
      },
      { ...baseConfig, durationUnit: "minutes" },
    );

    expect(activity).toEqual(
      expect.objectContaining({
        durationMinutes: 45,
        startedAt: new Date("2026-06-17T16:00:00.000Z"),
      }),
    );
  });

  it("skips archived records and records without usable logged time", () => {
    expect(
      normalizeHubSpotLoggedHours(
        {
          id: "archived",
          archived: true,
          properties: {
            work_date: "2026-06-18",
            hours: "1",
          },
        },
        baseConfig,
      ),
    ).toBeNull();
    expect(
      normalizeHubSpotLoggedHours(
        {
          id: "no-duration",
          properties: {
            work_date: "2026-06-18",
            hours: "",
          },
        },
        baseConfig,
      ),
    ).toBeNull();
  });
});
