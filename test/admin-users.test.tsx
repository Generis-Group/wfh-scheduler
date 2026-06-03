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

    expect(screen.getByRole("heading", { name: "Admin" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Team members" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Departments" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Reports" })).toBeTruthy();
    expect(screen.getByLabelText("Team member assignments").className).toContain(
      "overflow-y-auto",
    );
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
    expect(screen.queryByLabelText("Existing departments")).toBeNull();
    expect(screen.getAllByText("Reviewer").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Admin").length).toBeGreaterThan(0);
    expect(screen.queryByText("Company settings")).toBeNull();
    expect(screen.queryByText("Required email domain")).toBeNull();
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
    fireEvent.click(screen.getByLabelText("Reviewer scope for Alex Employee"));
    fireEvent.click(
      screen.getAllByRole("option", { name: "Operations" }).at(-1)!,
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Employee, Reviewer, Admin")).toBeTruthy();
    expect(screen.getByText("Engineering, Operations")).toBeTruthy();
    expect(alexAssignments!.className).not.toContain("ring-[#93c5fd]");
    expect(screen.getByLabelText("Roles for Alex Employee").className).toContain(
      "ring-[#93c5fd]",
    );
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

  it("keeps assignment drafts while the team member list scrolls", () => {
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

    expect(screen.queryByLabelText("Next team member page")).toBeNull();
    expect(screen.queryByLabelText("Previous team member page")).toBeNull();
    expect(screen.getByLabelText("Team member assignments").className).toContain(
      "overflow-y-auto",
    );
    expect(screen.getByText("Employee, Reviewer, Admin")).toBeTruthy();
    expect(screen.getAllByText("All departments").length).toBeGreaterThan(0);
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
              departments: [],
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
