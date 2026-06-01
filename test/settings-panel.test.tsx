// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

vi.mock("next-auth/react", () => ({
  signIn: vi.fn(),
}));

import { SettingsPanel } from "@/components/settings/settings-panel";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("SettingsPanel", () => {
  it("keeps account settings mounted when switching settings tabs", () => {
    render(
      <SettingsPanel
        user={{
          id: "user-1",
          name: "Jad Chahin",
          email: "jad@generisgp.com",
          image: null,
          role: "ADMIN",
          mustChangePassword: false,
          hasPassword: true,
        }}
        connected={{ google: false, atlassian: false }}
        oauthConfig={{ google: false, atlassian: false }}
        initialSettings={{
          jiraCloudId: null,
          googleCalendarId: "primary",
          googleTaskListIds: [],
        }}
        companySettings={{ jiraProjectKeys: [] }}
        canManageCompanySettings
      />,
    );

    const nameInput = screen.getByLabelText("Name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Updated Name" } });

    fireEvent.click(screen.getByRole("button", { name: "Integrations" }));
    expect(nameInput.closest("section")?.hasAttribute("hidden")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe(
      "Updated Name",
    );
  });
});
