// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AdminUsers } from "@/components/admin/admin-users";

afterEach(() => {
  cleanup();
});

describe("AdminUsers", () => {
  it("presents admin management with employee, reviewer, and admin role controls", () => {
    render(
      <AdminUsers
        initialUsers={[
          {
            id: "employee-1",
            name: "Alex Employee",
            email: "alex@generisgp.com",
            role: "EMPLOYEE",
            roles: ["EMPLOYEE", "ADMIN"],
            status: "ACTIVE",
            reviewerAllDepartments: false,
            departments: [],
          },
          {
            id: "reviewer-1",
            name: "Riley Reviewer",
            email: "riley@generisgp.com",
            role: "REVIEWER",
            roles: ["REVIEWER"],
            status: "ACTIVE",
            reviewerAllDepartments: true,
            departments: [],
          },
        ]}
        initialDepartments={[]}
        initialSettings={{ jiraProjectKeys: [] }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Admin" })).toBeTruthy();
    expect(screen.getByText("Team members")).toBeTruthy();
    expect(screen.getByText("Alex Employee")).toBeTruthy();
    expect(screen.getByText("Riley Reviewer")).toBeTruthy();
    expect(screen.getAllByLabelText("Employee").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Reviewer").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Admin").length).toBeGreaterThan(0);
  });
});
