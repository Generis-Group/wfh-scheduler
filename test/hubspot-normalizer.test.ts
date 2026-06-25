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
  userMatchMode: "emailProperty",
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

  it("handles HubSpot call durations stored in milliseconds", () => {
    const activity = normalizeHubSpotLoggedHours(
      {
        id: "call-1",
        properties: {
          hs_timestamp: "2026-06-18T15:00:00.000Z",
          hs_call_duration: "1800000",
          hs_call_title: "Discovery call",
          hs_call_body: "<p>Discussed sponsor package</p>",
        },
      },
      {
        ...baseConfig,
        objectType: "0-48",
        dateProperty: "hs_timestamp",
        durationProperty: "hs_call_duration",
        durationUnit: "milliseconds",
        userEmailProperty: "hubspot_owner_id",
        userMatchMode: "ownerEmail",
        titleProperties: ["hs_call_title"],
        descriptionProperties: ["hs_call_body"],
      },
    );

    expect(activity).toEqual(
      expect.objectContaining({
        sourceId: "logged-hours:0-48:call-1",
        title: "Discovery call",
        description: "Discussed sponsor package",
        durationMinutes: 30,
      }),
    );
  });

  it("does not double-convert suffixed seconds or millisecond durations", () => {
    expect(
      normalizeHubSpotLoggedHours(
        {
          id: "seconds",
          properties: {
            work_date: "2026-06-18T15:00:00.000Z",
            hours: "30s",
            task_name: "Short follow-up call",
          },
        },
        { ...baseConfig, durationUnit: "seconds" },
      ),
    ).toEqual(expect.objectContaining({ durationMinutes: 1 }));
    expect(
      normalizeHubSpotLoggedHours(
        {
          id: "milliseconds",
          properties: {
            work_date: "2026-06-18T15:00:00.000Z",
            hours: "30000ms",
            task_name: "Short follow-up call",
          },
        },
        { ...baseConfig, durationUnit: "milliseconds" },
      ),
    ).toEqual(expect.objectContaining({ durationMinutes: 1 }));
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
