import { afterEach, describe, expect, it, vi } from "vitest";

import type { HubSpotLoggedHoursConfig } from "@/lib/integrations/hubspot";
import { searchHubSpotLoggedHours } from "@/lib/integrations/hubspot";

const baseConfig: HubSpotLoggedHoursConfig = {
  apiBaseUrl: "https://api.hubapi.com",
  crmApiVersion: "2026-03",
  token: "hubspot-token",
  objectType: "time_entries",
  dateProperty: "work_date",
  durationProperty: "hours",
  durationUnit: "hours",
  userEmailProperty: "user_email",
  titleProperties: ["task_name"],
  descriptionProperties: ["notes"],
  pageLimit: 2,
  dateFilterFormat: "epochMillis",
};

describe("HubSpot integration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("searches logged-hour records with date and user filters across pages", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [{ id: "hours-1", properties: { task_name: "One" } }],
            paging: { next: { after: "page-2" } },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [{ id: "hours-2", properties: { task_name: "Two" } }],
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const records = await searchHubSpotLoggedHours(
      baseConfig,
      "Employee@GenerisGP.com",
      new Date("2026-06-18T04:00:00.000Z"),
      new Date("2026-06-19T04:00:00.000Z"),
    );

    expect(records.map((record) => record.id)).toEqual(["hours-1", "hours-2"]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.hubapi.com/crm/objects/2026-03/time_entries/search",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer hubspot-token",
        }),
      }),
    );
    expect(
      JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)),
    ).toMatchObject({
      filterGroups: [
        {
          filters: [
            {
              propertyName: "user_email",
              operator: "EQ",
              value: "employee@generisgp.com",
            },
            {
              propertyName: "work_date",
              operator: "GTE",
              value: "1781755200000",
            },
            {
              propertyName: "work_date",
              operator: "LT",
              value: "1781841600000",
            },
          ],
        },
      ],
      properties: ["work_date", "hours", "user_email", "task_name", "notes"],
      limit: 2,
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject(
      {
        after: "page-2",
      },
    );
  });

  it("turns HubSpot permission failures into an actionable admin message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Forbidden", { status: 403 })),
    );

    await expect(
      searchHubSpotLoggedHours(
        baseConfig,
        "employee@generisgp.com",
        new Date("2026-06-18T04:00:00.000Z"),
        new Date("2026-06-19T04:00:00.000Z"),
      ),
    ).rejects.toThrow(
      "HubSpot logged-hours import needs access to the configured HubSpot data. Ask an admin to check the private app permissions.",
    );
  });
});
