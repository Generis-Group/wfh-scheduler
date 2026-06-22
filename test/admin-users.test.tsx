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

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/team",
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

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
        currentUserId="employee-1"
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "Manage roles, departments, and access",
      }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Team members" })).toBeTruthy();
    expect(
      screen.queryByText(/Assign roles, departments, and reviewer access/),
    ).toBeNull();
    expect(screen.getByText("Employee dept.")).toBeTruthy();
    expect(screen.getByText("Reviewer dept.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Departments" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Report management" }),
    ).toBeTruthy();
    const assignments = screen.getByLabelText("Team member assignments");
    expect(assignments.className).toContain("reference-paginated-viewport");
    expect(assignments.className).toContain("reference-visible-rows-viewport");
    expect(assignments.className).toContain("reference-team-member-viewport");
    expect(within(assignments).getByText("Alex Employee")).toBeTruthy();
    expect(within(assignments).getByText("Riley Reviewer")).toBeTruthy();
    expect(
      screen.getByLabelText("Select all visible team members"),
    ).toBeTruthy();
    expect(screen.getByLabelText("Roles for Alex Employee")).toBeTruthy();
    expect(
      screen.getByLabelText("Employee departments for Alex Employee"),
    ).toBeTruthy();
    expect(
      screen.getByLabelText("Reviewer scope for Riley Reviewer"),
    ).toBeTruthy();
    expect(screen.getByLabelText("Roles for new team member")).toBeTruthy();
    expect(screen.queryByLabelText("Existing departments")).toBeNull();
    expect(screen.getAllByText("Reviewer").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByLabelText("Roles for Alex Employee"));
    expect(screen.getByRole("option", { name: "Admin" })).toBeTruthy();
    expect(screen.queryByText("Company settings")).toBeNull();
    expect(screen.queryByText("Required email domain")).toBeNull();
  });

  it("resets passwords for selected team members from the actions tile", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            temporaryPassword: "ResetPass123!",
            emailDelivery: {
              status: "SKIPPED",
              reason: "Email was skipped in tests.",
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
        currentUserId="employee-1"
      />,
    );

    expect(screen.getByRole("heading", { name: "Actions" })).toBeTruthy();
    expect(
      screen.queryByLabelText("Reset password for Alex Employee"),
    ).toBeNull();

    fireEvent.click(screen.getByLabelText("Select Riley Reviewer"));
    fireEvent.click(screen.getByLabelText("Reset password"));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/users/reviewer-1/reset-password",
      { method: "POST" },
    );

    const popup = await screen.findByRole("dialog", {
      name: "Temporary sign-in password",
    });

    expect(within(popup).getByText("riley@generisgp.com")).toBeTruthy();
    expect(within(popup).getByText("ResetPass123!")).toBeTruthy();
  });

  it("shows generated passwords when a later selected reset fails", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, _init?: RequestInit) => {
        const url = String(input);

        if (url.includes("employee-1/reset-password")) {
          return new Response(
            JSON.stringify({
              temporaryPassword: "FirstReset123!",
              emailDelivery: {
                status: "SKIPPED",
                reason: "Email was skipped in tests.",
              },
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        return new Response(JSON.stringify({ error: "Reset failed." }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AdminUsers
        initialUsers={initialUsers}
        initialDepartments={initialDepartments}
        currentUserId="admin-user"
      />,
    );

    fireEvent.click(screen.getByLabelText("Select Alex Employee"));
    fireEvent.click(screen.getByLabelText("Select Riley Reviewer"));
    fireEvent.click(screen.getByLabelText("Reset password"));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const popup = await screen.findByRole("dialog", {
      name: "Temporary sign-in password",
    });

    expect(within(popup).getByText("alex@generisgp.com")).toBeTruthy();
    expect(within(popup).getByText("FirstReset123!")).toBeTruthy();
    expect(screen.getByText("Reset failed.")).toBeTruthy();
  });

  it("selects team members by row click and modifier click", () => {
    render(
      <AdminUsers
        initialUsers={initialUsers}
        initialDepartments={initialDepartments}
        currentUserId="employee-1"
      />,
    );

    fireEvent.click(screen.getByLabelText("Alex Employee assignments"));
    expect(screen.getByText("1 selected")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Riley Reviewer assignments"), {
      ctrlKey: true,
    });
    expect(screen.getByText("2 selected")).toBeTruthy();

    expect(
      (screen.getByLabelText("Select Alex Employee") as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(
      (screen.getByLabelText("Select Riley Reviewer") as HTMLInputElement)
        .checked,
    ).toBe(true);
  });

  it("removes selected team members with an exclusive action", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            user: {
              ...initialUsers[1],
              status: "DISABLED",
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const confirmMock = vi.fn(() => true);
    vi.stubGlobal("confirm", confirmMock);

    render(
      <AdminUsers
        initialUsers={initialUsers}
        initialDepartments={initialDepartments}
        currentUserId="employee-1"
      />,
    );

    fireEvent.click(screen.getByLabelText("Select Riley Reviewer"));
    fireEvent.click(screen.getByLabelText("Remove account"));

    expect(
      (screen.getByLabelText("Reset password") as HTMLInputElement).disabled,
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(confirmMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "Apply this destructive action to 1 team member?",
      ),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/users/reviewer-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "DISABLED" }),
      }),
    );
    await waitFor(() =>
      expect(screen.queryByText("Riley Reviewer")).toBeNull(),
    );
    expect(screen.getByText("1 account removed.")).toBeTruthy();
  });

  it("deletes report data for selected team members from the actions tile", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ deleted: { dailyReports: 2 } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const confirmMock = vi.fn(() => true);
    vi.stubGlobal("confirm", confirmMock);

    render(
      <AdminUsers
        initialUsers={initialUsers}
        initialDepartments={initialDepartments}
        currentUserId="employee-1"
      />,
    );

    fireEvent.click(screen.getByLabelText("Select Riley Reviewer"));
    fireEvent.click(screen.getByLabelText("Delete report data"));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(confirmMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "Apply this destructive action to 1 team member?",
      ),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/users/reviewer-1/data", {
      method: "DELETE",
    });
    expect(
      screen.getByText("Report data deleted for 1 team member."),
    ).toBeTruthy();
  });

  it("does not apply destructive actions when confirmation is cancelled", () => {
    const fetchMock = vi.fn();
    const confirmMock = vi.fn(() => false);
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("confirm", confirmMock);

    render(
      <AdminUsers
        initialUsers={initialUsers}
        initialDepartments={initialDepartments}
        currentUserId="employee-1"
      />,
    );

    fireEvent.click(screen.getByLabelText("Select Riley Reviewer"));
    fireEvent.click(screen.getByLabelText("Delete report data"));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("removes a department from the admin department list and assignments", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AdminUsers
        initialUsers={initialUsers}
        initialDepartments={initialDepartments}
        currentUserId="employee-1"
        section="departments"
      />,
    );

    const departmentList = screen.getByLabelText("Existing departments");
    expect(screen.getByLabelText("departments pagination")).toBeTruthy();
    fireEvent.click(
      within(departmentList).getByRole("button", {
        name: "Remove Engineering department",
      }),
    );

    expect(screen.getByText("Remove Engineering?")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/departments/dept-engineering",
      { method: "DELETE" },
    );
    await waitFor(() =>
      expect(within(departmentList).queryByText("Engineering")).toBeNull(),
    );

    expect(screen.getByText("Department removed.")).toBeTruthy();
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
        currentUserId="employee-1"
      />,
    );

    const alexAssignments = within(
      screen.getByLabelText("Team member assignments"),
    )
      .getByText("Alex Employee")
      .closest("article");
    expect(alexAssignments).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Roles for Alex Employee"));
    fireEvent.click(screen.getByRole("option", { name: "Reviewer" }));
    fireEvent.click(
      screen.getByLabelText("Employee departments for Alex Employee"),
    );
    fireEvent.click(screen.getByRole("option", { name: "Operations" }));
    fireEvent.click(screen.getByLabelText("Reviewer scope for Alex Employee"));
    fireEvent.click(
      screen.getAllByRole("option", { name: "Operations" }).at(-1)!,
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Employee, Reviewer, Admin")).toBeTruthy();
    expect(screen.getByText("Engineering, Operations")).toBeTruthy();
    expect(alexAssignments!.className).not.toContain("ring-[#93c5fd]");
    expect(
      screen.getByLabelText("Roles for Alex Employee").className,
    ).toContain("ring-[#93c5fd]");
    expect(
      screen.getByLabelText("Employee departments for Alex Employee").className,
    ).toContain("ring-[#93c5fd]");
    expect(
      screen.getByLabelText("Reviewer scope for Alex Employee").className,
    ).toContain("ring-[#93c5fd]");
    expect(within(alexAssignments!).queryByText("Saved")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(request.roles).toEqual(["EMPLOYEE", "REVIEWER", "ADMIN"]);
    expect(request.employeeDepartmentIds).toEqual([
      "dept-engineering",
      "dept-operations",
    ]);
    expect(request.reviewerDepartmentIds).toEqual(["dept-operations"]);
  });

  it("requires reviewer scope before saving reviewer assignments", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AdminUsers
        initialUsers={initialUsers}
        initialDepartments={initialDepartments}
        currentUserId="employee-1"
      />,
    );

    fireEvent.click(screen.getByLabelText("Roles for Alex Employee"));
    fireEvent.click(screen.getByRole("option", { name: "Reviewer" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        "Your account needs reviewer scope. Select departments or all departments.",
      ),
    ).toBeTruthy();
  });

  it("keeps assignment drafts while paging the team member list", () => {
    const manyUsers = [
      ...initialUsers,
      ...Array.from({ length: 9 }, (_, index) => ({
        id: `employee-extra-${index}`,
        name: `Extra Employee ${index}`,
        email: `extra${index}@generisgp.com`,
        role: "EMPLOYEE" as const,
        roles: ["EMPLOYEE" as const],
        status: "ACTIVE" as const,
        reviewerAllDepartments: false,
        departments: [
          {
            departmentId: "dept-engineering",
            role: "EMPLOYEE" as const,
            department: initialDepartments[0],
          },
        ],
      })),
    ];

    render(
      <AdminUsers
        initialUsers={manyUsers}
        initialDepartments={initialDepartments}
        currentUserId="employee-1"
      />,
    );

    fireEvent.click(screen.getByLabelText("Roles for Alex Employee"));
    fireEvent.click(screen.getByRole("option", { name: "Reviewer" }));
    fireEvent.click(screen.getByLabelText("Reviewer scope for Alex Employee"));
    fireEvent.click(screen.getByRole("option", { name: "All departments" }));

    expect(
      (screen.getByLabelText("Previous page") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByLabelText("Next page") as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(screen.getByRole("button", { name: "Page 1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Go to page 2" })).toBeTruthy();
    expect(
      screen.getByLabelText("Team member assignments").className,
    ).toContain("reference-paginated-viewport");
    expect(screen.getByText("Employee, Reviewer, Admin")).toBeTruthy();
    expect(screen.getAllByText("All departments").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Go to page 2" }));

    expect(screen.getByRole("button", { name: "Page 2" })).toBeTruthy();
    expect(screen.getByLabelText("Roles for Extra Employee 4")).toBeTruthy();
  });

  it("does not allow the current admin to remove their own admin role", () => {
    render(
      <AdminUsers
        initialUsers={initialUsers}
        initialDepartments={initialDepartments}
        currentUserId="employee-1"
      />,
    );

    fireEvent.click(screen.getByLabelText("Roles for Alex Employee"));

    expect(
      (screen.getByRole("option", { name: "Admin" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("shows temporary credentials in a fixed popup instead of an in-flow panel", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            user: {
              id: "new-user",
              name: "Morgan Small",
              email: "morgan@generisgp.com",
              role: "EMPLOYEE",
              roles: ["EMPLOYEE"],
              status: "ACTIVE",
              reviewerAllDepartments: false,
              departments: [
                {
                  departmentId: "dept-engineering",
                  role: "EMPLOYEE",
                  department: initialDepartments[0],
                },
              ],
            },
            temporaryPassword: "TempPass123!",
            emailDelivery: {
              status: "SKIPPED",
              reason: "Email was skipped in tests.",
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
        currentUserId="employee-1"
      />,
    );

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Morgan Small" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "morgan@generisgp.com" },
    });
    fireEvent.click(
      screen.getByLabelText("Employee departments for new team member"),
    );
    fireEvent.click(screen.getByRole("option", { name: "Engineering" }));
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    const popup = await screen.findByRole("dialog", {
      name: "Temporary sign-in password",
    });

    expect(popup.className).toContain("fixed");
    expect(within(popup).getByText("morgan@generisgp.com")).toBeTruthy();
    expect(within(popup).getByText("TempPass123!")).toBeTruthy();
    expect(screen.queryByText("Copy the password below.")).toBeNull();

    fireEvent.click(
      within(popup).getByRole("button", {
        name: "Close temporary password",
      }),
    );

    expect(
      screen.queryByRole("dialog", { name: "Temporary sign-in password" }),
    ).toBeNull();
  });
});
