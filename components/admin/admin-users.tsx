"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownAZ,
  ArrowUpZA,
  ChevronLeft,
  ChevronRight,
  Copy,
  KeyRound,
  Loader2,
  Save,
  Search,
  UserPlus,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FixedToast } from "@/components/ui/fixed-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import { Select } from "@/components/ui/select";
import { markServerDataStale } from "@/lib/client-cache-invalidation";
import { cn } from "@/lib/utils";

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

type UserPatch = Partial<User> & {
  departmentIds?: string[];
  employeeDepartmentIds?: string[];
  reviewerDepartmentIds?: string[];
};

type UserDraft = {
  roles: UserRole[];
  employeeDepartmentIds: string[];
  reviewerDepartmentIds: string[];
  reviewerAllDepartments: boolean;
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
    return `${emailDelivery.reason ?? "Email was not sent."} Copy it from this popup.`;
  }

  return `${emailDelivery.error ?? "Email delivery failed."} Copy it from this popup.`;
}

const roleOptions: Array<{ value: UserRole; label: string }> = [
  { value: "EMPLOYEE", label: "Employee" },
  { value: "REVIEWER", label: "Reviewer" },
  { value: "ADMIN", label: "Admin" },
];
const allDepartmentsValue = "__ALL_DEPARTMENTS__";
const userPageSizeOptions = [10, 25, 50];
const dirtyControlClassName =
  "bg-[#f8fbff] ring-[#93c5fd] shadow-[inset_0_0_0_1px_rgba(37,99,235,0.08),0_0_0_3px_rgba(37,99,235,0.08)] dark:bg-blue-400/10 dark:ring-blue-300/45";

type NameSortDirection = "asc" | "desc";

function rolesForUser(user: Pick<User, "role" | "roles">) {
  const source = user.roles?.length ? user.roles : [user.role];
  const roles = roleOptions
    .map((option) => option.value)
    .filter((role) => source.includes(role));

  return roles.length ? roles : (["EMPLOYEE"] as UserRole[]);
}

function roleValues(values: string[]) {
  return roleOptions
    .map((option) => option.value)
    .filter((role) => values.includes(role));
}

function sameValues<T extends string>(first: T[], second: T[]) {
  return (
    first.length === second.length &&
    first.every((value) => second.includes(value))
  );
}

function sameRoles(first: UserRole[], second: UserRole[]) {
  return sameValues(first, second);
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

function userSortableName(user: User) {
  return (user.name?.trim() || user.email?.trim() || "").toLocaleLowerCase();
}

function compareUsersByName(
  first: User,
  second: User,
  direction: NameSortDirection,
) {
  const directionMultiplier = direction === "asc" ? 1 : -1;
  const nameComparison = userSortableName(first).localeCompare(
    userSortableName(second),
    undefined,
    { numeric: true, sensitivity: "base" },
  );

  if (nameComparison !== 0) {
    return nameComparison * directionMultiplier;
  }

  const emailComparison = (first.email ?? "").localeCompare(
    second.email ?? "",
    undefined,
    { numeric: true, sensitivity: "base" },
  );

  if (emailComparison !== 0) {
    return emailComparison * directionMultiplier;
  }

  return first.id.localeCompare(second.id) * directionMultiplier;
}

function userMatchesSearch(user: User, query: string) {
  if (!query) {
    return true;
  }

  const searchableText = [user.name, user.email]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();

  return searchableText.includes(query);
}

export function AdminUsers({
  initialUsers,
  initialDepartments,
  currentUserId,
}: {
  initialUsers: User[];
  initialDepartments: Department[];
  currentUserId?: string | null;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [departments, setDepartments] = useState(initialDepartments);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<UserRole[]>(["EMPLOYEE"]);
  const [newDepartmentName, setNewDepartmentName] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [nameSortDirection, setNameSortDirection] =
    useState<NameSortDirection>("asc");
  const [userPage, setUserPage] = useState(1);
  const [userPageSize, setUserPageSize] = useState(10);
  const [message, setMessage] = useState<string | null>(null);
  const [userDrafts, setUserDrafts] = useState<Record<string, UserDraft>>({});
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
  const [isSavingPage, setIsSavingPage] = useState(false);
  const hasUserDraftChanges = Object.keys(userDrafts).length > 0;
  const hasPendingChanges = hasUserDraftChanges;
  const warnedAboutPendingChanges = useRef(false);
  const normalizedUserSearch = userSearch.trim().toLocaleLowerCase();
  const filteredUsers = useMemo(
    () =>
      users
        .filter((user) => userMatchesSearch(user, normalizedUserSearch))
        .sort((first, second) =>
          compareUsersByName(first, second, nameSortDirection),
        ),
    [nameSortDirection, normalizedUserSearch, users],
  );
  const userPageCount = Math.max(
    1,
    Math.ceil(filteredUsers.length / userPageSize),
  );
  const currentUserPage = Math.min(userPage, userPageCount);
  const visibleUsers = useMemo(() => {
    const startIndex = (currentUserPage - 1) * userPageSize;

    return filteredUsers.slice(startIndex, startIndex + userPageSize);
  }, [currentUserPage, filteredUsers, userPageSize]);
  const firstVisibleUser = filteredUsers.length
    ? (currentUserPage - 1) * userPageSize + 1
    : 0;
  const lastVisibleUser = Math.min(
    currentUserPage * userPageSize,
    filteredUsers.length,
  );
  const userResultLabel =
    filteredUsers.length === users.length
      ? `${users.length} team member${users.length === 1 ? "" : "s"}`
      : `${filteredUsers.length} of ${users.length} team members`;

  useEffect(() => {
    setUserPage((current) => Math.max(1, Math.min(current, userPageCount)));
  }, [userPageCount]);

  useEffect(() => {
    if (!hasPendingChanges) {
      warnedAboutPendingChanges.current = false;
      return;
    }

    if (!warnedAboutPendingChanges.current) {
      warnedAboutPendingChanges.current = true;
      setMessage(
        "You have unsaved admin changes. Save before leaving this page.",
      );
    }
  }, [hasPendingChanges]);

  useEffect(() => {
    if (!hasPendingChanges) {
      return;
    }

    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", warnBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", warnBeforeUnload);
    };
  }, [hasPendingChanges]);

  useEffect(() => {
    if (!hasPendingChanges) {
      return;
    }

    function warnBeforePageNavigation(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      if (!(event.target instanceof Element)) {
        return;
      }

      const anchor = event.target.closest<HTMLAnchorElement>("a[href]");

      if (
        !anchor ||
        anchor.hasAttribute("download") ||
        (anchor.target && anchor.target !== "_self")
      ) {
        return;
      }

      const nextUrl = new URL(anchor.href, window.location.href);
      const currentUrl = new URL(window.location.href);
      const sameRoute =
        nextUrl.origin === currentUrl.origin &&
        nextUrl.pathname === currentUrl.pathname &&
        nextUrl.search === currentUrl.search;

      if (sameRoute) {
        return;
      }

      if (
        !window.confirm(
          "You have unsaved admin changes. Leave without saving?",
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    document.addEventListener("click", warnBeforePageNavigation, true);

    return () => {
      document.removeEventListener("click", warnBeforePageNavigation, true);
    };
  }, [hasPendingChanges]);

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
          : "User created. Temporary password opened.",
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

  function orderedDepartmentIds(ids: string[]) {
    return departments
      .map((department) => department.id)
      .filter((departmentId) => ids.includes(departmentId));
  }

  function savedDraftForUser(user: User): UserDraft {
    const savedRoles = rolesForUser(user);

    return normalizeUserDraft({
      roles: savedRoles,
      employeeDepartmentIds: departmentIdsForUser(user, "EMPLOYEE"),
      reviewerDepartmentIds: departmentIdsForUser(user, "REVIEWER"),
      reviewerAllDepartments: Boolean(user.reviewerAllDepartments),
    });
  }

  function normalizeUserDraft(draft: UserDraft): UserDraft {
    const normalizedRoles = roleValues(draft.roles);

    return {
      roles: normalizedRoles,
      employeeDepartmentIds: normalizedRoles.includes("EMPLOYEE")
        ? orderedDepartmentIds(draft.employeeDepartmentIds)
        : [],
      reviewerDepartmentIds:
        normalizedRoles.includes("REVIEWER") && !draft.reviewerAllDepartments
          ? orderedDepartmentIds(draft.reviewerDepartmentIds)
          : [],
      reviewerAllDepartments: normalizedRoles.includes("REVIEWER")
        ? draft.reviewerAllDepartments
        : false,
    };
  }

  function sameUserDraft(first: UserDraft, second: UserDraft) {
    const normalizedFirst = normalizeUserDraft(first);
    const normalizedSecond = normalizeUserDraft(second);

    return (
      sameRoles(normalizedFirst.roles, normalizedSecond.roles) &&
      sameValues(
        normalizedFirst.employeeDepartmentIds,
        normalizedSecond.employeeDepartmentIds,
      ) &&
      sameValues(
        normalizedFirst.reviewerDepartmentIds,
        normalizedSecond.reviewerDepartmentIds,
      ) &&
      normalizedFirst.reviewerAllDepartments ===
        normalizedSecond.reviewerAllDepartments
    );
  }

  function draftForUser(user: User) {
    return userDrafts[user.id] ?? savedDraftForUser(user);
  }

  function userDisplayName(user: User) {
    return user.name ?? user.email ?? "This user";
  }

  function assignmentErrorForUser(user: User, draft: UserDraft) {
    const normalizedDraft = normalizeUserDraft(draft);
    const label =
      user.id === currentUserId ? "Your account" : userDisplayName(user);

    if (
      user.id === currentUserId &&
      !normalizedDraft.roles.includes("ADMIN")
    ) {
      return "You cannot remove your own admin access.";
    }

    if (
      normalizedDraft.roles.includes("EMPLOYEE") &&
      normalizedDraft.employeeDepartmentIds.length === 0
    ) {
      return `${label} needs at least one employee department.`;
    }

    if (
      normalizedDraft.roles.includes("REVIEWER") &&
      !normalizedDraft.reviewerAllDepartments &&
      normalizedDraft.reviewerDepartmentIds.length === 0
    ) {
      return `${label} needs reviewer scope. Select departments or all departments.`;
    }

    return null;
  }

  function roleOptionsForUser(user: User) {
    return roleOptions.map((option) =>
      user.id === currentUserId && option.value === "ADMIN"
        ? { ...option, disabled: true }
        : option,
    );
  }

  function updateUserDraft(
    user: User,
    updater: (draft: UserDraft) => UserDraft,
  ) {
    const savedDraft = savedDraftForUser(user);

    setUserDrafts((current) => {
      const nextDraft = normalizeUserDraft(
        updater(current[user.id] ?? savedDraft),
      );

      if (sameUserDraft(nextDraft, savedDraft)) {
        const nextDrafts = { ...current };
        delete nextDrafts[user.id];
        return nextDrafts;
      }

      return {
        ...current,
        [user.id]: nextDraft,
      };
    });
  }

  function updateUserRoleDraft(user: User, nextRoles: string[]) {
    const normalizedRoles = roleValues(nextRoles);

    if (normalizedRoles.length === 0) {
      setMessage("Each user needs at least one role.");
      return;
    }

    updateUserDraft(user, (draft) => ({
      ...draft,
      roles: normalizedRoles,
      reviewerAllDepartments: normalizedRoles.includes("REVIEWER")
        ? draft.reviewerAllDepartments
        : false,
    }));
  }

  function updateUserDepartmentDraft(
    user: User,
    role: "EMPLOYEE" | "REVIEWER",
    departmentIds: string[],
  ) {
    updateUserDraft(user, (draft) => ({
      ...draft,
      [role === "EMPLOYEE" ? "employeeDepartmentIds" : "reviewerDepartmentIds"]:
        departmentIds,
    }));
  }

  function reviewerScopeValue(draft: UserDraft) {
    return draft.reviewerAllDepartments
      ? [allDepartmentsValue]
      : draft.reviewerDepartmentIds;
  }

  function updateReviewerScopeDraft(user: User, values: string[]) {
    updateUserDraft(user, (draft) => ({
      ...draft,
      reviewerAllDepartments:
        values.includes(allDepartmentsValue) && !draft.reviewerAllDepartments,
      reviewerDepartmentIds:
        values.includes(allDepartmentsValue) && !draft.reviewerAllDepartments
          ? []
          : values.filter((value) => value !== allDepartmentsValue),
    }));
  }

  function updateCreateRoles(nextRoles: string[]) {
    const normalizedRoles = roleValues(nextRoles);

    if (normalizedRoles.length === 0) {
      setMessage("Each user needs at least one role.");
      return;
    }

    setRoles(normalizedRoles);
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
          : "Temporary password opened.",
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

  async function savePageChanges() {
    if (isSavingPage || !hasPendingChanges) {
      return;
    }

    setIsSavingPage(true);
    setMessage(null);

    try {
      const draftEntries = Object.entries(userDrafts);
      const pendingDrafts: Array<{
        draft: UserDraft;
        user: User;
        userId: string;
      }> = [];

      for (const [userId, draft] of draftEntries) {
        const user = users.find((item) => item.id === userId);

        if (!user) {
          continue;
        }

        const normalizedDraft = normalizeUserDraft(draft);
        const assignmentError = assignmentErrorForUser(user, normalizedDraft);

        if (assignmentError) {
          setMessage(assignmentError);
          return;
        }

        pendingDrafts.push({ user, draft: normalizedDraft, userId });
      }

      for (const { user, draft, userId } of pendingDrafts) {
        const saved = await updateUser(user, {
          roles: draft.roles,
          role: primaryRole(draft.roles),
          reviewerAllDepartments: draft.reviewerAllDepartments,
          employeeDepartmentIds: draft.employeeDepartmentIds,
          reviewerDepartmentIds: draft.reviewerDepartmentIds,
        });

        if (!saved) {
          return;
        }

        setUserDrafts((current) => {
          const nextDrafts = { ...current };
          delete nextDrafts[userId];
          return nextDrafts;
        });
      }

      setMessage("Admin changes saved.");
    } finally {
      setIsSavingPage(false);
    }
  }

  return (
    <>
      <main className="reference-page min-[1180px]:flex min-[1180px]:h-full min-[1180px]:min-h-0 min-[1180px]:flex-col">
        <div className="reference-page-header">
          <div>
            <h1 className="reference-title">Admin</h1>
            <p className="reference-subtitle">
              Manage employees, reviewers, admins, departments, and password
              access.
            </p>
          </div>
          <Button
            type="button"
            className="min-w-[132px] bg-[#2563eb] hover:bg-[#1d4ed8]"
            disabled={!hasPendingChanges || isSavingPage}
            onClick={savePageChanges}
          >
            {isSavingPage ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {isSavingPage
              ? "Saving..."
              : hasPendingChanges
                ? "Save changes"
                : "Saved"}
          </Button>
        </div>

        {isSavingPage ? (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-white/60 backdrop-blur-[2px] dark:bg-[#07111f]/65">
            <div className="flex items-center gap-3 rounded-[12px] bg-white px-4 py-3 text-sm font-semibold text-[#1d4ed8] shadow-[0_20px_60px_rgba(15,23,42,0.18)] ring-1 ring-[#dbe5f4] dark:bg-[#0f1b2a] dark:text-blue-200 dark:ring-[#263a55]">
              <Loader2 className="h-5 w-5 animate-spin" />
              Saving admin changes
            </div>
          </div>
        ) : null}

        <div className="grid items-start gap-2 min-[1180px]:min-h-0 min-[1180px]:flex-1 min-[1180px]:grid-cols-[minmax(0,1fr)_320px] min-[1180px]:items-stretch">
          <Card className="min-[1180px]:flex min-[1180px]:min-h-0 min-[1180px]:flex-col">
            <CardHeader className="p-2.5 pb-1.5">
              <CardTitle>Team members</CardTitle>
              <CardDescription className="text-xs leading-4">
                Assign roles, departments, and reviewer access without deleting
                reporting history.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 p-2 pt-0 min-[1180px]:flex min-[1180px]:min-h-0 min-[1180px]:flex-1 min-[1180px]:flex-col min-[1180px]:gap-2 min-[1180px]:space-y-0">
              <div className="flex flex-col gap-2 rounded-[8px] bg-[#f8fafc] p-2 ring-1 ring-[#dbe5f4] dark:bg-[#0b1523] dark:ring-[#263a55] min-[760px]:flex-row min-[760px]:items-center min-[760px]:justify-between">
                <div className="relative min-w-0 min-[760px]:w-[380px]">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748b] dark:text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    aria-label="Search team members by name"
                    className="h-9 border-[#cbd5e1] bg-white pl-9 text-sm ring-1 ring-[#dbe5f4] dark:border-[#263a55] dark:bg-[#0f1b2a] dark:ring-[#263a55]"
                    placeholder="Search by name"
                    value={userSearch}
                    onChange={(event) => {
                      setUserSearch(event.target.value);
                      setUserPage(1);
                    }}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-xs font-medium text-[#64748b] dark:text-muted-foreground">
                    {userResultLabel}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 min-w-[104px] justify-start bg-white px-2 text-xs dark:bg-[#0f1b2a]"
                    onClick={() => {
                      setNameSortDirection((current) =>
                        current === "asc" ? "desc" : "asc",
                      );
                      setUserPage(1);
                    }}
                  >
                    <span className="mr-1.5 flex h-3.5 w-3.5 items-center justify-center">
                      {nameSortDirection === "asc" ? (
                        <ArrowDownAZ className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowUpZA className="h-3.5 w-3.5" />
                      )}
                    </span>
                    {nameSortDirection === "asc" ? "Name A-Z" : "Name Z-A"}
                  </Button>
                  <Select
                    aria-label="Team members per page"
                    className="h-8 w-[116px] bg-white text-xs dark:bg-[#0f1b2a]"
                    value={String(userPageSize)}
                    onChange={(event) => {
                      setUserPageSize(Number(event.currentTarget.value));
                      setUserPage(1);
                    }}
                  >
                    {userPageSizeOptions.map((option) => (
                      <option key={option} value={option}>
                        {option} / page
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div
                aria-label="Team member assignments"
                className="space-y-2 min-[1180px]:min-h-0 min-[1180px]:flex-1 min-[1180px]:overflow-y-auto min-[1180px]:overscroll-contain min-[1180px]:pr-1 min-[1180px]:[scrollbar-gutter:stable]"
              >
                {filteredUsers.length === 0 ? (
                  <div className="rounded-[8px] bg-[#f8fafc] py-5 text-center text-xs text-[#64748b] ring-1 ring-[#dbe5f4] dark:bg-[#0b1523] dark:ring-[#263a55]">
                    {users.length === 0
                      ? "No users have been created yet."
                      : "No team members match this search."}
                  </div>
                ) : (
                  visibleUsers.map((user) => {
                    const savedDraft = savedDraftForUser(user);
                    const draft = draftForUser(user);
                    const draftRoles = draft.roles;
                    const rolesChanged = !sameRoles(
                      draft.roles,
                      savedDraft.roles,
                    );
                    const employeeDepartmentsChanged = !sameValues(
                      draft.employeeDepartmentIds,
                      savedDraft.employeeDepartmentIds,
                    );
                    const reviewerScopeChanged =
                      draft.reviewerAllDepartments !==
                        savedDraft.reviewerAllDepartments ||
                      !sameValues(
                        draft.reviewerDepartmentIds,
                        savedDraft.reviewerDepartmentIds,
                      );
                    const hasEmployeeRole = draftRoles.includes("EMPLOYEE");
                    const hasReviewerRole = draftRoles.includes("REVIEWER");
                    const userLabel = user.name ?? user.email ?? "user";

                    return (
                      <article
                        key={user.id}
                        aria-label={`${userLabel} assignments`}
                        className="rounded-[8px] bg-white p-2 shadow-[0_4px_14px_rgba(15,23,42,0.035)] ring-1 ring-[#dbe5f4] transition-colors dark:bg-[#0f1b2a] dark:ring-[#263a55]"
                      >
                        <div className="flex flex-col gap-2 min-[720px]:flex-row min-[720px]:items-start min-[720px]:justify-between">
                          <div className="min-w-0">
                            <div className="flex min-w-0 items-center gap-1.5">
                              <h3 className="truncate text-sm font-semibold text-[#0f172a] dark:text-foreground">
                                {user.name ?? "-"}
                              </h3>
                            </div>
                            <div className="mt-0.5 truncate text-xs text-[#64748b] dark:text-muted-foreground">
                              {user.email}
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 shrink-0 px-2 text-xs"
                            disabled={resettingPasswordUserId !== null}
                            onClick={() => resetPassword(user)}
                          >
                            {resettingPasswordUserId === user.id ? (
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <KeyRound className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            {resettingPasswordUserId === user.id
                              ? "Resetting..."
                              : "Reset password"}
                          </Button>
                        </div>

                        <div className="mt-2 grid gap-1.5 min-[900px]:grid-cols-[minmax(180px,0.64fr)_minmax(0,1fr)_minmax(0,1fr)]">
                          <MultiSelect
                            options={roleOptionsForUser(user)}
                            value={draftRoles}
                            onChange={(nextRoles) =>
                              updateUserRoleDraft(user, nextRoles)
                            }
                            minSelected={1}
                            disabled={isSavingPage}
                            aria-label={`Roles for ${userLabel}`}
                            triggerClassName={cn(
                              "h-8 text-xs",
                              rolesChanged && dirtyControlClassName,
                            )}
                          />

                          <DepartmentSelector
                            departments={departments}
                            selectedIds={draft.employeeDepartmentIds}
                            disabled={!hasEmployeeRole || isSavingPage}
                            placeholder={
                              hasEmployeeRole
                                ? "Select departments"
                                : "Enable employee role"
                            }
                            emptyText="Create departments to assign employees."
                            aria-label={`Employee departments for ${userLabel}`}
                            dirty={employeeDepartmentsChanged}
                            onChange={(departmentIds) =>
                              updateUserDepartmentDraft(
                                user,
                                "EMPLOYEE",
                                departmentIds,
                              )
                            }
                          />

                          <DepartmentSelector
                            departments={departments}
                            selectedIds={reviewerScopeValue(draft)}
                            includeAllOption
                            disabled={!hasReviewerRole || isSavingPage}
                            placeholder={
                              hasReviewerRole
                                ? "Select scope"
                                : "Enable reviewer role"
                            }
                            emptyText="Create departments to scope reviewer access."
                            aria-label={`Reviewer scope for ${userLabel}`}
                            dirty={reviewerScopeChanged}
                            onChange={(values) =>
                              updateReviewerScopeDraft(user, values)
                            }
                          />
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
              {filteredUsers.length > 0 ? (
                <div className="flex flex-col gap-2 rounded-[8px] bg-white px-2 py-1.5 text-xs text-[#64748b] ring-1 ring-[#dbe5f4] dark:bg-[#0f1b2a] dark:text-muted-foreground dark:ring-[#263a55] min-[640px]:flex-row min-[640px]:items-center min-[640px]:justify-between">
                  <div>
                    Showing {firstVisibleUser}-{lastVisibleUser} of{" "}
                    {filteredUsers.length}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 bg-white p-0 dark:bg-[#0f1b2a]"
                      aria-label="Previous team member page"
                      disabled={currentUserPage <= 1}
                      onClick={() =>
                        setUserPage((current) => Math.max(1, current - 1))
                      }
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="min-w-[62px] text-center font-medium text-[#334155] dark:text-foreground">
                      {currentUserPage} / {userPageCount}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 bg-white p-0 dark:bg-[#0f1b2a]"
                      aria-label="Next team member page"
                      disabled={currentUserPage >= userPageCount}
                      onClick={() =>
                        setUserPage((current) =>
                          Math.min(userPageCount, current + 1),
                        )
                      }
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <div className="space-y-2">
            <Card>
              <CardHeader className="p-2.5 pb-1.5">
                <CardTitle>Create team member</CardTitle>
                <CardDescription className="text-xs leading-4">
                  Creates an active credentials account with a temporary
                  password.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-2 pt-0">
                <form className="space-y-2" onSubmit={createUser}>
                  <div className="space-y-1">
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      className="h-8 text-xs"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      className="h-8 text-xs"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Roles</Label>
                    <MultiSelect
                      options={roleOptions}
                      value={roles}
                      onChange={updateCreateRoles}
                      minSelected={1}
                      disabled={isCreatingUser}
                      aria-label="Roles for new team member"
                      triggerClassName="h-8 text-xs"
                    />
                  </div>
                  <Button
                    className="h-8 w-full bg-[#2563eb] text-xs hover:bg-[#1d4ed8]"
                    disabled={isCreatingUser}
                  >
                    {isCreatingUser ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    {isCreatingUser ? "Creating..." : "Create"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-2.5 pb-1.5">
                <CardTitle>Departments</CardTitle>
                <CardDescription className="text-xs leading-4">
                  Create departments, then assign employees and reviewer access
                  above.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 p-2 pt-0">
                <form className="flex gap-2" onSubmit={createDepartment}>
                  <Input
                    className="h-8 text-xs"
                    value={newDepartmentName}
                    onChange={(event) =>
                      setNewDepartmentName(event.target.value)
                    }
                    placeholder="Department name"
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    className="h-8 px-2 text-xs"
                    disabled={!newDepartmentName.trim() || creatingDepartment}
                  >
                    {creatingDepartment ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    {creatingDepartment ? "Adding..." : "Add"}
                  </Button>
                </form>
                <div
                  aria-label="Existing departments"
                  className="max-h-32 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]"
                >
                  {departments.length === 0 ? (
                    <span className="text-xs text-[#64748b] dark:text-muted-foreground">
                      No departments created yet.
                    </span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {departments.map((department) => (
                        <Badge
                          key={department.id}
                          variant="outline"
                          className="max-w-full overflow-hidden"
                          title={department.name}
                        >
                          <span className="min-w-0 truncate">
                            {department.name}
                          </span>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
      <TemporaryCredentialsPopup
        credentials={temporaryCredentials}
        onCopy={copyTemporaryPassword}
        onDismiss={() => setTemporaryCredentials(null)}
      />
      <FixedToast message={message} onDismiss={() => setMessage(null)} />
    </>
  );
}

function TemporaryCredentialsPopup({
  credentials,
  onCopy,
  onDismiss,
}: {
  credentials: {
    email: string;
    password: string;
    emailDelivery?: EmailDelivery | null;
  } | null;
  onCopy: () => void;
  onDismiss: () => void;
}) {
  if (!credentials) {
    return null;
  }

  return (
    <aside
      className="fixed right-4 top-4 z-50 w-[min(560px,calc(100vw-2rem))] rounded-[12px] bg-white p-4 text-sm text-[#0f172a] shadow-[0_24px_70px_rgba(15,23,42,0.22)] ring-1 ring-[#dbe5f4] dark:bg-[#0f1b2a] dark:text-foreground dark:ring-white/[0.08]"
      role="dialog"
      aria-labelledby="temporary-password-title"
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div
            id="temporary-password-title"
            className="font-semibold text-[#0f172a] dark:text-foreground"
          >
            Temporary sign-in password
          </div>
          <p className="mt-1 text-[#475569] dark:text-muted-foreground">
            {emailDeliveryMessage(credentials.emailDelivery)} They will be asked
            to change it after signing in.
          </p>
        </div>
        <button
          type="button"
          className="-mr-1 -mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-[#64748b] transition-colors hover:bg-[#eef2f7] hover:text-[#0f172a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] dark:text-muted-foreground dark:hover:bg-white/10 dark:hover:text-foreground"
          aria-label="Close temporary password"
          onClick={onDismiss}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="min-w-0 rounded-[8px] bg-[#f7f9fc] px-3 py-2 ring-1 ring-[#dbe5f4] dark:bg-white/[0.04] dark:ring-white/[0.08]">
          <div className="text-xs font-medium uppercase tracking-wide text-[#64748b] dark:text-muted-foreground">
            Email
          </div>
          <div className="mt-1 break-all font-mono text-[#111827] dark:text-foreground">
            {credentials.email || "-"}
          </div>
        </div>
        <div className="min-w-0 rounded-[8px] bg-[#f7f9fc] px-3 py-2 ring-1 ring-[#dbe5f4] dark:bg-white/[0.04] dark:ring-white/[0.08]">
          <div className="text-xs font-medium uppercase tracking-wide text-[#64748b] dark:text-muted-foreground">
            Password
          </div>
          <div className="mt-1 break-all font-mono text-[#111827] dark:text-foreground">
            {credentials.password}
          </div>
        </div>
      </div>

      <div className="mt-3 flex justify-end">
        <Button
          variant="outline"
          className="h-9 bg-white dark:bg-white/[0.04]"
          onClick={onCopy}
        >
          <Copy className="mr-2 h-4 w-4" />
          Copy password
        </Button>
      </div>
    </aside>
  );
}

function DepartmentSelector({
  departments,
  selectedIds,
  disabled,
  dirty = false,
  placeholder,
  emptyText,
  includeAllOption = false,
  "aria-label": ariaLabel,
  onChange,
}: {
  departments: Department[];
  selectedIds: string[];
  disabled?: boolean;
  dirty?: boolean;
  placeholder: string;
  emptyText: string;
  includeAllOption?: boolean;
  "aria-label": string;
  onChange: (departmentIds: string[]) => void;
}) {
  const options = [
    ...(includeAllOption
      ? [{ value: allDepartmentsValue, label: "All departments" }]
      : []),
    ...departments.map((department) => ({
      value: department.id,
      label: department.name,
    })),
  ];

  return (
    <>
      {departments.length === 0 ? (
        <span className="text-xs text-[#64748b] dark:text-muted-foreground">
          {emptyText}
        </span>
      ) : (
        <MultiSelect
          options={options}
          value={selectedIds}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          aria-label={ariaLabel}
          triggerClassName={cn(
            "h-8 text-xs",
            dirty && dirtyControlClassName,
          )}
        />
      )}
    </>
  );
}
