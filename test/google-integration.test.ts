import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  calendarMock,
  gmailMock,
  getProviderAccountMock,
  oauthClient,
  OAuth2Mock,
  tasksMock,
} = vi.hoisted(() => {
  const oauthClient = {
    on: vi.fn(),
    setCredentials: vi.fn(),
  };

  return {
    calendarMock: vi.fn(() => ({ service: "calendar" })),
    gmailMock: vi.fn(() => ({ service: "gmail" })),
    getProviderAccountMock: vi.fn(),
    oauthClient,
    OAuth2Mock: vi.fn(function OAuth2() {
      return oauthClient;
    }),
    tasksMock: vi.fn(() => ({ service: "tasks" })),
  };
});

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: OAuth2Mock,
    },
    calendar: calendarMock,
    gmail: gmailMock,
    tasks: tasksMock,
  },
}));

vi.mock("@/lib/integrations/provider-accounts", () => ({
  getProviderAccount: getProviderAccountMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    account: {
      updateMany: vi.fn(),
    },
  },
}));

import { getGoogleServices } from "@/lib/integrations/google";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GOOGLE_CLIENT_ID = "google-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "google-client-secret";
  getProviderAccountMock.mockResolvedValue({
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expires_at: 1_800_000_000,
  });
});

describe("Google integration", () => {
  it("exposes Gmail alongside Calendar and Tasks services", async () => {
    const services = await getGoogleServices("user-1");

    expect(OAuth2Mock).toHaveBeenCalledWith(
      "google-client-id",
      "google-client-secret",
    );
    expect(oauthClient.setCredentials).toHaveBeenCalledWith(
      expect.objectContaining({
        access_token: "access-token",
        refresh_token: "refresh-token",
      }),
    );
    expect(calendarMock).toHaveBeenCalledWith({
      version: "v3",
      auth: oauthClient,
    });
    expect(gmailMock).toHaveBeenCalledWith({
      version: "v1",
      auth: oauthClient,
    });
    expect(tasksMock).toHaveBeenCalledWith({
      version: "v1",
      auth: oauthClient,
    });
    expect(services).toEqual({
      calendar: { service: "calendar" },
      gmail: { service: "gmail" },
      tasks: { service: "tasks" },
    });
  });
});
