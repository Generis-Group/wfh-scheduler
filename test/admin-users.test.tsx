// @vitest-environment jsdom

import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminUsers } from "@/components/admin/admin-users";

type AdminUsersProps = React.ComponentProps<typeof AdminUsers>;

const initialDepartments: AdminUsersProps["initialDepartments"] = [
  {
    id: "dept-engineering",
    name: "Engineering",
    slug: "engineering",
  },
  {
    id: "dept-operations",
    name: "Operations",
    slug: "operations",
  },
];

const initialUsers: AdminUsersProps["initialUsers"] = [
  {
    id: "employee-1",
    name: "Alex Employee",
    email: "alex@generisgp.com",
    role: "EMPLOYEE" as const,
    roles: ["EMPLOYEE", "ADMIN"],
    status: "ACTIVE" as const,
    reviewerAllDepartments: false,
    departments: [
      {
        departmentId: "dept-engineering",
        role: "EMPLOYEE" as const,
        department: initialDepartments[0],
      },
    ],
  },
  {
    id: "reviewer-1",
    name: "Riley Reviewer",
    email: "riley@generisgp.com",
    role: "REVIEWER" as const,
    roles: ["REVIEWER"],
    status: "ACTIVE" as const,
    reviewerAllDepartments: true,
    departments: [
      {
        departmentId: "dept-operations",
        role: "REVIEWER" as const,
        department: initialDepartments[1],
      },
    ],
  },
];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AdminUsers", () => {
  it("presents admin management with employee, reviewer, and admin role controls", () => {
    render(
      <AdminUsers
        initialUsers={initialUsers}
        initialDepartments={initialDepartments}
      />,
    );

    expect(screen.getByRole("heading", { name: "Admin" })).toBeTruthy();
    expect(screen.getByText("Team members")).toBeTruthy();
    expect(screen.getByText("Alex Employee")).toBeTruthy();
    expect(screen.getByText("Riley Reviewer")).toBeTruthy();
    expect(screen.getByLabelText("Roles for Alex Employee")).toBeTruthy();
    expect(
      screen.getByLabelText("Employee departments for Alex Employee"),
    ).toBeTruthy();
    expect(
      screen.getByLabelText("Reviewer scope for Riley Reviewer"),
    ).toBeTruthy();
    expect(screen.getByLabelText("Roles for new team member")).toBeTruthy();
    expect(screen.getByLabelText("Existing departments")).toBeTruthy();
    expect(screen.getAllByText("Reviewer").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Admin").length).toBeGreaterThan(0);
    expect(screen.queryByText("Company settings")).toBeNull();
    expect(screen.queryByText("Required email domain")).toBeNull();
  });

  it("drafts assignment changes instantly and saves them with the page", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            user: {
              ...initialUsers[0],
              role: "ADMIN",
              roles: ["EMPLOYEE", "REVIEWER", "ADMIN"],
              departments: [
                {
                  departmentId: "dept-engineering",
                  role: "EMPLOYEE",
                  department: initialDepartments[0],
                },
                {
                  departmentId: "dept-operations",
                  role: "EMPLOYEE",
                  department: initialDepartments[1],
                },
              ],
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AdminUsers
        initialUsers={initialUsers}
        initialDepartments={initialDepartments}
      />,
    );

    const alexAssignments = screen
      .getByText("Alex Employee")
      .closest("article");
    expect(alexAssignments).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Roles for Alex Employee"));
    fireEvent.click(screen.getByRole("option", { name: "Reviewer" }));
    fireEvent.click(
      screen.getByLabelText("Employee departments for Alex Employee"),
    );
    fireEvent.click(screen.getByRole("option", { name: "Operations" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Employee, Reviewer, Admin")).toBeTruthy();
    expect(screen.getByText("Engineering, Operations")).toBeTruthy();
    expect(alexAssignments!.className).toContain("ring-[#93c5fd]");
    expect(within(alexAssignments!).queryByText("Saved")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(request.roles).toEqual(["EMPLOYEE", "REVIEWER", "ADMIN"]);
    expect(request.employeeDepartmentIds).toEqual([
      "dept-engineering",
      "dept-operations",
    ]);
    expect(request.reviewerDepartmentIds).toEqual([]);
  });
});
