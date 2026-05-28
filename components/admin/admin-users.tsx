"use client";

import { useState } from "react";
import { Copy, KeyRound, Loader2, Save, UserPlus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FixedToast } from "@/components/ui/fixed-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { markServerDataStale } from "@/lib/client-cache-invalidation";

type UserRole = "EMPLOYEE" | "REVIEWER" | "ADMIN";

type User = {
  id: string;
  email?: string | null;
  name?: string | null;
  role: UserRole;
  roles?: UserRole[];
  status: "INVITED" | "ACTIVE" | "DISABLED";
  reviewerAllDepartments?: boolean;
  departments?: Array<{
    departmentId: string;
    role?: UserRole | null;
    department: Department;
  }>;
};

type Department = {
  id: string;
  name: string;
  slug: string;
};

type CompanySettings = {
  jiraProjectKeys: string[];
};

type UserPatch = Partial<User> & {
  departmentIds?: string[];
  employeeDepartmentIds?: string[];
  reviewerDepartmentIds?: string[];
};

type EmailDelivery =
  | {
      status: "SENT";
      providerMessageId?: string | null;
    }
  | {
      status: "SKIPPED";
      reason?: string;
    }
  | {
      status: "FAILED";
      error?: string;
    };

function emailDeliveryMessage(emailDelivery?: EmailDelivery | null) {
  if (!emailDelivery) {
    return "Email delivery status is unavailable.";
  }

  if (emailDelivery.status === "SENT") {
    return "The temporary password was emailed to the user.";
  }

  if (emailDelivery.status === "SKIPPED") {
    return `${emailDelivery.reason ?? "Email was not sent."} Copy the password below.`;
  }

  return `${emailDelivery.error ?? "Email delivery failed."} Copy the password below.`;
}

const roleOptions: Array<{ value: UserRole; label: string }> = [
  { value: "EMPLOYEE", label: "Employee" },
  { value: "REVIEWER", label: "Reviewer" },
  { value: "ADMIN", label: "Admin" },
];

function rolesForUser(user: Pick<User, "role" | "roles">) {
  const source = user.roles?.length ? user.roles : [user.role];
  const roles = roleOptions
    .map((option) => option.value)
    .filter((role) => source.includes(role));

  return roles.length ? roles : (["EMPLOYEE"] as UserRole[]);
}

function hasRole(user: Pick<User, "role" | "roles">, role: UserRole) {
  return rolesForUser(user).includes(role);
}

function primaryRole(roles: UserRole[]) {
  if (roles.includes("ADMIN")) {
    return "ADMIN";
  }

  if (roles.includes("REVIEWER")) {
    return "REVIEWER";
  }

  return "EMPLOYEE";
}

function membershipRole(membership: { role?: UserRole | null }) {
  return membership.role ?? "EMPLOYEE";
}

export function AdminUsers({
  initialUsers,
  initialDepartments,
  initialSettings,
}: {
  initialUsers: User[];
  initialDepartments: Department[];
  initialSettings: CompanySettings;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [departments, setDepartments] = useState(initialDepartments);
  const [settings, setSettings] = useState(initialSettings);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<UserRole[]>(["EMPLOYEE"]);
  const [newDepartmentName, setNewDepartmentName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [temporaryCredentials, setTemporaryCredentials] = useState<{
    email: string;
    password: string;
    emailDelivery?: EmailDelivery | null;
  } | null>(null);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [creatingDepartment, setCreatingDepartment] = useState(false);
  const [resettingPasswordUserId, setResettingPasswordUserId] = useState<
    string | null
  >(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  async function createUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isCreatingUser) {
      return;
    }

    setMessage(null);
    setTemporaryCredentials(null);
    setIsCreatingUser(true);

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, roles, status: "ACTIVE" }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error ?? "Unable to create user.");
        return;
      }

      setUsers((current) => [...current, data.user]);
      markServerDataStale();
      setName("");
      setEmail("");
      setRoles(["EMPLOYEE"]);
      setTemporaryCredentials({
        email: data.user.email,
        password: data.temporaryPassword,
        emailDelivery: data.emailDelivery,
      });
      setMessage(
        data.emailDelivery?.status === "SENT"
          ? "User created and temporary password emailed."
          : "User created. Copy the temporary password below.",
      );
    } catch {
      setMessage("Unable to create user. Check your connection and try again.");
    } finally {
      setIsCreatingUser(false);
    }
  }

  async function updateUser(user: User, patch: UserPatch) {
    const apiPatch: UserPatch = { ...patch };
    delete apiPatch.departments;
    let response: Response;

    try {
      response = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiPatch),
      });
    } catch {
      setMessage("Unable to update user. Check your connection and try again.");
      return false;
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      setMessage(data.error ?? "Unable to update user.");
      return false;
    }

    setUsers((current) =>
      current.map((item) => (item.id === user.id ? data.user : item)),
    );
    markServerDataStale();
    return true;
  }

  async function createDepartment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = newDepartmentName.trim();

    if (!trimmedName) {
      return;
    }

    setCreatingDepartment(true);

    try {
      const response = await fetch("/api/admin/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setMessage(data.error ?? "Unable to create department.");
        return;
      }

      setDepartments((current) =>
        [...current, data.department].sort((left, right) =>
          left.name.localeCompare(right.name),
        ),
      );
      markServerDataStale();
      setNewDepartmentName("");
      setMessage("Department created.");
    } catch {
      setMessage(
        "Unable to create department. Check your connection and try again.",
      );
    } finally {
      setCreatingDepartment(false);
    }
  }

  function departmentIdsForUser(user: User, role: "EMPLOYEE" | "REVIEWER") {
    return (
      user.departments
        ?.filter((membership) => membershipRole(membership) === role)
        .map((membership) => membership.departmentId) ?? []
    );
  }

  async function toggleUserDepartment(
    user: User,
    departmentId: string,
    role: "EMPLOYEE" | "REVIEWER",
    checked: boolean,
  ) {
    const currentIds = departmentIdsForUser(user, role);
    const departmentIds = checked
      ? [...new Set([...currentIds, departmentId])]
      : currentIds.filter((id) => id !== departmentId);
    const nextRoleDepartments = departments
      .filter((department) => departmentIds.includes(department.id))
      .map((department) => ({
        departmentId: department.id,
        role,
        department,
      }));
    const previousDepartments = user.departments ?? [];
    const nextDepartments = [
      ...previousDepartments.filter(
        (membership) => membershipRole(membership) !== role,
      ),
      ...nextRoleDepartments,
    ];

    setUsers((current) =>
      current.map((item) =>
        item.id === user.id
          ? {
              ...item,
              departments: nextDepartments,
            }
          : item,
      ),
    );
    const saved = await updateUser(user, {
      [role === "EMPLOYEE" ? "employeeDepartmentIds" : "reviewerDepartmentIds"]:
        departmentIds,
      departments: nextDepartments,
    });

    if (!saved) {
      setUsers((current) =>
        current.map((item) =>
          item.id === user.id
            ? {
                ...item,
                departments: previousDepartments,
              }
            : item,
        ),
      );
    }
  }

  function roleDepartmentSummary(user: User, role: "EMPLOYEE" | "REVIEWER") {
    if (role === "REVIEWER" && user.reviewerAllDepartments) {
      return "All departments";
    }

    const names =
      user.departments
        ?.filter((membership) => membershipRole(membership) === role)
        .map((membership) => membership.department.name) ?? [];

    return names.length ? names.join(", ") : "No departments";
  }

  async function toggleUserRole(user: User, role: UserRole, checked: boolean) {
    const currentRoles = rolesForUser(user);
    const nextRoles = checked
      ? [...new Set([...currentRoles, role])]
      : currentRoles.filter((item) => item !== role);

    if (nextRoles.length === 0) {
      setMessage("Each user needs at least one role.");
      return;
    }

    await updateUser(user, {
      roles: nextRoles,
      role: primaryRole(nextRoles),
      reviewerAllDepartments: nextRoles.includes("REVIEWER")
        ? user.reviewerAllDepartments
        : false,
    });
  }

  function toggleCreateRole(role: UserRole, checked: boolean) {
    setRoles((currentRoles) => {
      const nextRoles = checked
        ? [...new Set([...currentRoles, role])]
        : currentRoles.filter((item) => item !== role);

      return nextRoles.length ? nextRoles : currentRoles;
    });
  }

  async function resetPassword(user: User) {
    if (resettingPasswordUserId) {
      return;
    }

    setTemporaryCredentials(null);
    setResettingPasswordUserId(user.id);

    try {
      const response = await fetch(
        `/api/admin/users/${user.id}/reset-password`,
        { method: "POST" },
      );
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error ?? "Unable to reset password.");
        return;
      }

      setTemporaryCredentials({
        email: user.email ?? "",
        password: data.temporaryPassword,
        emailDelivery: data.emailDelivery,
      });
      markServerDataStale();
      setMessage(
        data.emailDelivery?.status === "SENT"
          ? "Temporary password emailed."
          : "Temporary password created. Copy it below.",
      );
    } catch {
      setMessage(
        "Unable to reset password. Check your connection and try again.",
      );
    } finally {
      setResettingPasswordUserId(null);
    }
  }

  async function copyTemporaryPassword() {
    if (!temporaryCredentials) {
      return;
    }

    await navigator.clipboard?.writeText(temporaryCredentials.password);
    setMessage("Temporary password copied.");
  }

  async function saveSettings() {
    if (isSavingSettings) {
      return;
    }

    setIsSavingSettings(true);

    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setMessage(data.error ?? "Unable to save company settings.");
        return;
      }

      markServerDataStale();
      setMessage("Company settings saved.");
    } catch {
      setMessage(
        "Unable to save company settings. Check your connection and try again.",
      );
    } finally {
      setIsSavingSettings(false);
    }
  }

  return (
    <>
      <main className="reference-page">
        <div className="reference-page-header">
          <div>
            <h1 className="reference-title">Admin</h1>
            <p className="reference-subtitle">
              Manage employees, reviewers, admins, departments, and reporting
              settings.
            </p>
          </div>
        </div>

        {temporaryCredentials ? (
          <div className="mb-4 rounded-[12px] border border-[#bfdbfe] bg-[#eff6ff] p-4 text-sm shadow-[0_8px_24px_rgba(15,23,42,0.05)] dark:border-[#1d4ed8]/40 dark:bg-[#132239]">
            <div className="flex flex-col gap-3 min-[760px]:flex-row min-[760px]:items-start min-[760px]:justify-between">
              <div>
                <div className="font-semibold text-[#0f172a] dark:text-foreground">
                  Temporary sign-in password
                </div>
                <p className="mt-1 text-[#475569] dark:text-muted-foreground">
                  {emailDeliveryMessage(temporaryCredentials.emailDelivery)}
                  {" "}They will be asked to change it after signing in.
                </p>
                <div className="mt-3 grid gap-2 min-[760px]:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)]">
                  <div className="rounded-[8px] bg-white px-3 py-2 ring-1 ring-[#dbe5f4] dark:bg-[#0f1b2a] dark:ring-[#263a55]">
                    <div className="text-xs font-medium uppercase tracking-wide text-[#64748b]">
                      Email
                    </div>
                    <div className="mt-1 break-all font-mono text-[#111827] dark:text-foreground">
                      {temporaryCredentials.email || "-"}
                    </div>
                  </div>
                  <div className="rounded-[8px] bg-white px-3 py-2 ring-1 ring-[#dbe5f4] dark:bg-[#0f1b2a] dark:ring-[#263a55]">
                    <div className="text-xs font-medium uppercase tracking-wide text-[#64748b]">
                      Password
                    </div>
                    <div className="mt-1 break-all font-mono text-[#111827] dark:text-foreground">
                      {temporaryCredentials.password}
                    </div>
                  </div>
                </div>
              </div>
              <Button
                variant="outline"
                className="shrink-0 bg-white dark:bg-[#0f1b2a]"
                onClick={copyTemporaryPassword}
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy password
              </Button>
            </div>
          </div>
        ) : null}

        <div className="grid items-start gap-4 min-[1180px]:grid-cols-[minmax(0,1fr)_360px]">
          <Card>
            <CardHeader>
              <CardTitle>Team members</CardTitle>
              <CardDescription>
                Assign roles, departments, and reviewer access without deleting
                reporting history.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead>Departments</TableHead>
                    <TableHead>Password</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="py-8 text-center text-sm text-[#64748b]"
                      >
                        No users have been created yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>{user.name ?? "-"}</TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          <div className="grid gap-1.5">
                            {roleOptions.map((option) => (
                              <label
                                key={option.value}
                                className="flex items-center gap-2 text-xs font-medium text-[#334155] dark:text-muted-foreground"
                              >
                                <Checkbox
                                  checked={hasRole(user, option.value)}
                                  onChange={(event) =>
                                    toggleUserRole(
                                      user,
                                      option.value,
                                      event.target.checked,
                                    )
                                  }
                                />
                                {option.label}
                              </label>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="min-w-[260px]">
                          <div className="space-y-4">
                            {hasRole(user, "EMPLOYEE") ? (
                              <DepartmentChecklist
                                title="Employee departments"
                                summary={roleDepartmentSummary(
                                  user,
                                  "EMPLOYEE",
                                )}
                                departments={departments}
                                selectedIds={departmentIdsForUser(
                                  user,
                                  "EMPLOYEE",
                                )}
                                emptyText="Create departments to assign employees."
                                onToggle={(departmentId, checked) =>
                                  toggleUserDepartment(
                                    user,
                                    departmentId,
                                    "EMPLOYEE",
                                    checked,
                                  )
                                }
                              />
                            ) : null}
                            {hasRole(user, "REVIEWER") ? (
                              <div className="space-y-2">
                                <label className="flex items-center gap-2 text-xs font-medium text-[#334155] dark:text-muted-foreground">
                                  <Checkbox
                                    checked={Boolean(
                                      user.reviewerAllDepartments,
                                    )}
                                    onChange={(event) =>
                                      updateUser(user, {
                                        reviewerAllDepartments:
                                          event.target.checked,
                                      })
                                    }
                                  />
                                  Can review all departments
                                </label>
                                <DepartmentChecklist
                                  title="Reviewer scope"
                                  summary={roleDepartmentSummary(
                                    user,
                                    "REVIEWER",
                                  )}
                                  departments={departments}
                                  selectedIds={departmentIdsForUser(
                                    user,
                                    "REVIEWER",
                                  )}
                                  emptyText="Create departments to scope reviewer access."
                                  onToggle={(departmentId, checked) =>
                                    toggleUserDepartment(
                                      user,
                                      departmentId,
                                      "REVIEWER",
                                      checked,
                                    )
                                  }
                                />
                              </div>
                            ) : null}
                            {!hasRole(user, "EMPLOYEE") &&
                            !hasRole(user, "REVIEWER") ? (
                              <span className="text-xs text-[#64748b] dark:text-muted-foreground">
                                Admin-only users do not need department
                                assignments.
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={resettingPasswordUserId !== null}
                            onClick={() => resetPassword(user)}
                          >
                            {resettingPasswordUserId === user.id ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <KeyRound className="mr-2 h-4 w-4" />
                            )}
                            {resettingPasswordUserId === user.id
                              ? "Resetting..."
                              : "Reset"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Create team member</CardTitle>
                <CardDescription>
                  Creates an active credentials account with a temporary
                  password.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={createUser}>
                  <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Roles</Label>
                    <div className="grid gap-2 rounded-[10px] border border-[#dbe5f4] bg-[#f8fafc] p-3 dark:border-[#263a55] dark:bg-[#0b1523]">
                      {roleOptions.map((option) => (
                        <label
                          key={option.value}
                          className="flex items-center gap-2 text-sm font-medium text-[#334155] dark:text-muted-foreground"
                        >
                          <Checkbox
                            checked={roles.includes(option.value)}
                            onChange={(event) =>
                              toggleCreateRole(
                                option.value,
                                event.target.checked,
                              )
                            }
                          />
                          {option.label}
                        </label>
                      ))}
                    </div>
                  </div>
                  <Button
                    className="w-full bg-[#2563eb] hover:bg-[#1d4ed8]"
                    disabled={isCreatingUser}
                  >
                    {isCreatingUser ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <UserPlus className="mr-2 h-4 w-4" />
                    )}
                    {isCreatingUser ? "Creating..." : "Create"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Departments</CardTitle>
                <CardDescription>
                  Create departments, then assign employees and reviewer access
                  above.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <form className="flex gap-2" onSubmit={createDepartment}>
                  <Input
                    value={newDepartmentName}
                    onChange={(event) =>
                      setNewDepartmentName(event.target.value)
                    }
                    placeholder="Department name"
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={!newDepartmentName.trim() || creatingDepartment}
                  >
                    {creatingDepartment ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    {creatingDepartment ? "Adding..." : "Add"}
                  </Button>
                </form>
                <div className="flex flex-wrap gap-2">
                  {departments.length === 0 ? (
                    <span className="text-sm text-[#64748b] dark:text-muted-foreground">
                      No departments created yet.
                    </span>
                  ) : (
                    departments.map((department) => (
                      <Badge key={department.id} variant="outline">
                        {department.name}
                      </Badge>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Company settings</CardTitle>
                <CardDescription>
                  Generis access is fixed to @generisgp.com; Jira project
                  filters are optional.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Required email domain</Label>
                  <div className="rounded-[8px] bg-[#f8fafc] px-3 py-2 text-sm font-semibold text-[#0f172a] dark:bg-muted dark:text-foreground">
                    @generisgp.com
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Jira projects</Label>
                  <Input
                    value={settings.jiraProjectKeys.join(", ")}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        jiraProjectKeys: event.target.value
                          .split(",")
                          .map((item) => item.trim().toUpperCase())
                          .filter(Boolean),
                      }))
                    }
                  />
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={isSavingSettings}
                  onClick={saveSettings}
                >
                  {isSavingSettings ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  {isSavingSettings ? "Saving..." : "Save settings"}
                </Button>
                <div className="flex flex-wrap gap-2">
                  {settings.jiraProjectKeys.map((key) => (
                    <Badge key={key} variant="outline">
                      {key}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
      <FixedToast message={message} onDismiss={() => setMessage(null)} />
    </>
  );
}

function DepartmentChecklist({
  title,
  summary,
  departments,
  selectedIds,
  emptyText,
  onToggle,
}: {
  title: string;
  summary: string;
  departments: Department[];
  selectedIds: string[];
  emptyText: string;
  onToggle: (departmentId: string, checked: boolean) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div>
        <div className="text-xs font-semibold text-[#334155] dark:text-muted-foreground">
          {title}
        </div>
        <div className="text-xs text-[#64748b] dark:text-muted-foreground">
          {summary}
        </div>
      </div>
      <div className="grid gap-1">
        {departments.length === 0 ? (
          <span className="text-xs text-[#64748b] dark:text-muted-foreground">
            {emptyText}
          </span>
        ) : (
          departments.map((department) => (
            <label
              key={department.id}
              className="flex items-center gap-2 text-xs text-[#334155] dark:text-muted-foreground"
            >
              <Checkbox
                checked={selectedIds.includes(department.id)}
                onChange={(event) =>
                  onToggle(department.id, event.target.checked)
                }
              />
              {department.name}
            </label>
          ))
        )}
      </div>
    </div>
  );
}
