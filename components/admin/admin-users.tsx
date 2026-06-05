"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownAZ,
  ArrowUpZA,
  Ban,
  Copy,
  KeyRound,
  Loader2,
  Save,
  Search,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";

import {
  AdminSectionFrame,
  type AdminSectionId,
} from "@/components/admin/admin-section-frame";
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
import { MultiSelect } from "@/components/ui/multi-select";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { markServerDataStale } from "@/lib/client-cache-invalidation";
import { defaultPaginationPageSize } from "@/lib/pagination";
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

type TeamBulkAction = "resetPassword" | "removeAccount" | "deleteData";

type TemporaryCredential = {
  email: string;
  password: string;
  emailDelivery?: EmailDelivery | null;
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
const defaultTeamMemberPageSize = 5;
const defaultDepartmentPageSize = defaultPaginationPageSize;
const dirtyControlClassName =
  "bg-[#f8fbff] ring-[#93c5fd] shadow-[inset_0_0_0_1px_rgba(37,99,235,0.08),0_0_0_3px_rgba(37,99,235,0.08)] dark:bg-blue-400/10 dark:ring-blue-300/45";
const teamMemberCheckboxClass =
  "h-4 w-4 [&_span]:rounded-[4px] [&_svg]:h-3 [&_svg]:w-3";
const teamActionCheckboxClass =
  "h-3.5 w-3.5 [&_span]:rounded-[4px] [&_svg]:h-2.5 [&_svg]:w-2.5";
const teamBulkActionOptions: Array<{
  value: TeamBulkAction;
  label: string;
  danger?: boolean;
  exclusive?: boolean;
  disabled?: boolean;
}> = [
  {
    value: "resetPassword",
    label: "Reset password",
  },
  {
    value: "deleteData",
    label: "Delete report data",
  },
  {
    value: "removeAccount",
    label: "Remove account",
    danger: true,
    exclusive: true,
  },
];

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
  section = "team",
}: {
  initialUsers: User[];
  initialDepartments: Department[];
  currentUserId?: string | null;
  section?: Exclude<AdminSectionId, "reports">;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [departments, setDepartments] = useState(initialDepartments);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<UserRole[]>(["EMPLOYEE"]);
  const [newDepartmentName, setNewDepartmentName] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [userPage, setUserPage] = useState(1);
  const [userPageSize, setUserPageSize] = useState(defaultTeamMemberPageSize);
  const [departmentPage, setDepartmentPage] = useState(1);
  const [departmentPageSize, setDepartmentPageSize] = useState(
    defaultDepartmentPageSize,
  );
  const [nameSortDirection, setNameSortDirection] =
    useState<NameSortDirection>("asc");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectionAnchorUserId, setSelectionAnchorUserId] = useState<
    string | null
  >(null);
  const [selectedTeamActions, setSelectedTeamActions] = useState<
    TeamBulkAction[]
  >([]);
  const [message, setMessage] = useState<string | null>(null);
  const [userDrafts, setUserDrafts] = useState<Record<string, UserDraft>>({});
  const [temporaryCredentials, setTemporaryCredentials] = useState<
    TemporaryCredential[] | null
  >(null);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [creatingDepartment, setCreatingDepartment] = useState(false);
  const [departmentToDelete, setDepartmentToDelete] =
    useState<Department | null>(null);
  const [deletingDepartmentId, setDeletingDepartmentId] = useState<
    string | null
  >(null);
  const [resettingPasswordUserId, setResettingPasswordUserId] = useState<
    string | null
  >(null);
  const [isApplyingTeamActions, setIsApplyingTeamActions] = useState(false);
  const [isSavingPage, setIsSavingPage] = useState(false);
  const hasUserDraftChanges = Object.keys(userDrafts).length > 0;
  const hasPendingChanges = hasUserDraftChanges;
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
  const pagedUsers = filteredUsers.slice(
    (currentUserPage - 1) * userPageSize,
    currentUserPage * userPageSize,
  );
  const visibleUserIds = pagedUsers.map((user) => user.id);
  const allVisibleUsersSelected =
    visibleUserIds.length > 0 &&
    visibleUserIds.every((userId) => selectedUserIds.includes(userId));
  const selectedUsers = selectedUserIds.flatMap((userId) => {
    const user = users.find((item) => item.id === userId);
    return user ? [user] : [];
  });
  const departmentPageCount = Math.max(
    1,
    Math.ceil(departments.length / departmentPageSize),
  );
  const currentDepartmentPage = Math.min(departmentPage, departmentPageCount);
  const pagedDepartments = departments.slice(
    (currentDepartmentPage - 1) * departmentPageSize,
    currentDepartmentPage * departmentPageSize,
  );
  const removeActionSelected = selectedTeamActions.includes("removeAccount");
  const nonExclusiveTeamActionSelected = selectedTeamActions.some(
    (action) => action !== "removeAccount",
  );

  useEffect(() => {
    setUserPage(1);
  }, [nameSortDirection, normalizedUserSearch]);

  useEffect(() => {
    if (userPage > userPageCount) {
      setUserPage(userPageCount);
    }
  }, [userPage, userPageCount]);

  useEffect(() => {
    if (departmentPage > departmentPageCount) {
      setDepartmentPage(departmentPageCount);
    }
  }, [departmentPage, departmentPageCount]);

  useEffect(() => {
    const userIds = new Set(users.map((user) => user.id));

    setSelectedUserIds((current) =>
      current.filter((userId) => userIds.has(userId)),
    );
    setSelectionAnchorUserId((current) =>
      current && userIds.has(current) ? current : null,
    );
  }, [users]);

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
        !window.confirm("You have unsaved admin changes. Leave without saving?")
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
      setTemporaryCredentials([
        {
          email: data.user.email,
          password: data.temporaryPassword,
          emailDelivery: data.emailDelivery,
        },
      ]);
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

  async function deleteDepartment(department: Department) {
    if (deletingDepartmentId) {
      return;
    }

    setDeletingDepartmentId(department.id);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/admin/departments/${encodeURIComponent(department.id)}`,
        { method: "DELETE" },
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setMessage(data.error ?? "Unable to remove department.");
        return;
      }

      setDepartments((current) =>
        current.filter((item) => item.id !== department.id),
      );
      setUsers((current) =>
        current.map((user) => ({
          ...user,
          departments:
            user.departments?.filter(
              (membership) => membership.departmentId !== department.id,
            ) ?? [],
        })),
      );
      setUserDrafts((current) =>
        Object.fromEntries(
          Object.entries(current).map(([userId, draft]) => [
            userId,
            {
              ...draft,
              employeeDepartmentIds: draft.employeeDepartmentIds.filter(
                (departmentId) => departmentId !== department.id,
              ),
              reviewerDepartmentIds: draft.reviewerDepartmentIds.filter(
                (departmentId) => departmentId !== department.id,
              ),
            },
          ]),
        ),
      );
      setDepartmentToDelete(null);
      markServerDataStale();
      setMessage("Department removed.");
    } catch {
      setMessage(
        "Unable to remove department. Check your connection and try again.",
      );
    } finally {
      setDeletingDepartmentId(null);
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

    if (user.id === currentUserId && !normalizedDraft.roles.includes("ADMIN")) {
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

  function isSelectionControl(target: EventTarget) {
    return (
      target instanceof Element &&
      Boolean(
        target.closest(
          'a,button,input,select,textarea,[role="button"],[role="listbox"],[role="option"]',
        ),
      )
    );
  }

  function toggleVisibleUserSelection(checked: boolean) {
    setSelectionAnchorUserId(visibleUserIds[0] ?? null);
    setSelectedUserIds((current) => {
      if (!checked) {
        return current.filter((userId) => !visibleUserIds.includes(userId));
      }

      return [...new Set([...current, ...visibleUserIds])];
    });
  }

  function toggleUserSelection(userId: string, checked: boolean) {
    setSelectionAnchorUserId(userId);
    setSelectedUserIds((current) => {
      if (!checked) {
        return current.filter((id) => id !== userId);
      }

      return current.includes(userId) ? current : [...current, userId];
    });
  }

  function selectUserRange(userId: string, additive: boolean) {
    const orderedIds = filteredUsers.map((user) => user.id);
    const currentIndex = orderedIds.indexOf(userId);
    const anchorIndex = selectionAnchorUserId
      ? orderedIds.indexOf(selectionAnchorUserId)
      : currentIndex;

    if (currentIndex === -1 || anchorIndex === -1) {
      setSelectedUserIds([userId]);
      setSelectionAnchorUserId(userId);
      return;
    }

    const start = Math.min(anchorIndex, currentIndex);
    const end = Math.max(anchorIndex, currentIndex);
    const rangeIds = orderedIds.slice(start, end + 1);

    setSelectedUserIds((current) =>
      additive ? [...new Set([...current, ...rangeIds])] : rangeIds,
    );
  }

  function selectUserFromRow(
    userId: string,
    event: React.MouseEvent<HTMLElement>,
  ) {
    if (isSelectionControl(event.target)) {
      return;
    }

    if (event.shiftKey) {
      selectUserRange(userId, event.ctrlKey || event.metaKey);
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      const isSelected = selectedUserIds.includes(userId);
      toggleUserSelection(userId, !isSelected);
      return;
    }

    setSelectedUserIds([userId]);
    setSelectionAnchorUserId(userId);
  }

  function toggleTeamAction(action: TeamBulkAction, checked: boolean) {
    setSelectedTeamActions((current) => {
      if (action === "removeAccount") {
        return checked ? ["removeAccount"] : [];
      }

      const withoutExclusiveActions = current.filter(
        (selectedAction) => selectedAction !== "removeAccount",
      );

      if (!checked) {
        return withoutExclusiveActions.filter(
          (selectedAction) => selectedAction !== action,
        );
      }

      return withoutExclusiveActions.includes(action)
        ? withoutExclusiveActions
        : [...withoutExclusiveActions, action];
    });
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

  async function resetPassword(
    user: User,
    options: { openPopup?: boolean } = {},
  ): Promise<TemporaryCredential | null> {
    const openPopup = options.openPopup ?? true;

    if (resettingPasswordUserId) {
      return null;
    }

    if (openPopup) {
      setTemporaryCredentials(null);
    }
    setMessage(null);
    setResettingPasswordUserId(user.id);

    try {
      const response = await fetch(
        `/api/admin/users/${user.id}/reset-password`,
        { method: "POST" },
      );
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error ?? "Unable to reset password.");
        return null;
      }

      const credentials = {
        email: user.email ?? "",
        password: data.temporaryPassword,
        emailDelivery: data.emailDelivery,
      };

      if (openPopup) {
        setTemporaryCredentials([credentials]);
      }

      markServerDataStale();
      if (openPopup) {
        setMessage(
          data.emailDelivery?.status === "SENT"
            ? "Temporary password emailed."
            : "Temporary password opened.",
        );
      }
      return credentials;
    } catch {
      setMessage(
        "Unable to reset password. Check your connection and try again.",
      );
      return null;
    } finally {
      setResettingPasswordUserId(null);
    }
  }

  async function deleteReportData(user: User) {
    try {
      const response = await fetch(`/api/admin/users/${user.id}/data`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setMessage(data.error ?? "Unable to delete report data.");
        return false;
      }

      markServerDataStale();
      return true;
    } catch {
      setMessage(
        "Unable to delete report data. Check your connection and try again.",
      );
      return false;
    }
  }

  async function applyTeamActions() {
    if (isApplyingTeamActions) {
      return;
    }

    if (selectedUsers.length === 0) {
      setMessage("Select at least one team member.");
      return;
    }

    if (selectedTeamActions.length === 0) {
      setMessage("Select an action to apply.");
      return;
    }

    if (
      selectedTeamActions.includes("removeAccount") &&
      selectedUsers.some((user) => user.id === currentUserId)
    ) {
      setMessage("You cannot remove your own account.");
      return;
    }

    const appliesDeleteData = selectedTeamActions.includes("deleteData");
    const appliesRemoveAccount = selectedTeamActions.includes("removeAccount");

    if (appliesDeleteData || appliesRemoveAccount) {
      const selectedCount = selectedUsers.length;
      const actionDescription = appliesRemoveAccount
        ? `remove ${selectedCount === 1 ? "this account" : "these accounts"}`
        : `delete report data for ${
            selectedCount === 1 ? "this team member" : "these team members"
          }`;
      const confirmed = window.confirm(
        `Apply this destructive action to ${selectedCount} team member${
          selectedCount === 1 ? "" : "s"
        }?\n\nThis will ${actionDescription} and cannot be undone.`,
      );

      if (!confirmed) {
        return;
      }
    }

    setIsApplyingTeamActions(true);
    setMessage(null);
    setTemporaryCredentials(null);

    try {
      const credentialResults: TemporaryCredential[] = [];
      const showPartialCredentials = () => {
        if (credentialResults.length > 0) {
          setTemporaryCredentials([...credentialResults]);
        }
      };

      if (selectedTeamActions.includes("resetPassword")) {
        for (const user of selectedUsers) {
          const credentials = await resetPassword(user, { openPopup: false });

          if (!credentials) {
            showPartialCredentials();
            return;
          }

          credentialResults.push(credentials);
        }
      }

      if (selectedTeamActions.includes("deleteData")) {
        for (const user of selectedUsers) {
          const deleted = await deleteReportData(user);

          if (!deleted) {
            showPartialCredentials();
            return;
          }
        }
      }

      if (selectedTeamActions.includes("removeAccount")) {
        for (const user of selectedUsers) {
          const removed = await updateUser(user, { status: "DISABLED" });

          if (!removed) {
            showPartialCredentials();
            return;
          }
        }

        const removedUserIds = new Set(selectedUsers.map((user) => user.id));
        setUsers((current) =>
          current.filter((user) => !removedUserIds.has(user.id)),
        );
        setUserDrafts((current) =>
          Object.fromEntries(
            Object.entries(current).filter(
              ([userId]) => !removedUserIds.has(userId),
            ),
          ),
        );
      }

      if (credentialResults.length > 0) {
        setTemporaryCredentials(credentialResults);
      }

      const appliedReset = selectedTeamActions.includes("resetPassword");
      const appliedDeleteData = selectedTeamActions.includes("deleteData");
      const appliedRemove = selectedTeamActions.includes("removeAccount");
      const selectedCount = selectedUsers.length;

      setSelectedTeamActions([]);
      setSelectedUserIds([]);
      setSelectionAnchorUserId(null);
      setMessage(
        appliedRemove
          ? `${selectedCount} account${selectedCount === 1 ? "" : "s"} removed.`
          : appliedDeleteData && appliedReset
            ? "Report data deleted and temporary passwords generated."
            : appliedDeleteData
              ? `Report data deleted for ${selectedCount} team member${
                  selectedCount === 1 ? "" : "s"
                }.`
              : appliedReset
                ? credentialResults.some(
                    (credentials) =>
                      credentials.emailDelivery?.status !== "SENT",
                  )
                  ? "Temporary passwords opened."
                  : "Temporary passwords emailed."
                : "Actions applied.",
      );
    } finally {
      setIsApplyingTeamActions(false);
    }
  }

  async function copyTemporaryPassword() {
    if (!temporaryCredentials?.length) {
      return;
    }

    await navigator.clipboard?.writeText(
      temporaryCredentials
        .map(
          (credentials) =>
            `${credentials.email || "Unknown user"}: ${credentials.password}`,
        )
        .join("\n"),
    );
    setMessage(
      temporaryCredentials.length === 1
        ? "Temporary password copied."
        : "Temporary passwords copied.",
    );
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
      <AdminSectionFrame
        activeSection={section}
        action={
          section === "team" ? (
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
          ) : null
        }
      >
        <div
          className={cn(
            "grid items-start gap-3",
            section === "team"
              ? "reference-admin-team-layout min-[1180px]:h-full min-[1180px]:min-h-0 min-[1180px]:items-stretch"
              : "min-[900px]:min-h-0 min-[900px]:flex-1 min-[900px]:grid-cols-[minmax(0,1fr)] min-[900px]:items-stretch",
          )}
        >
          {section === "team" ? (
            <Card className="reference-paginated-surface ring-0 shadow-[0_12px_34px_rgba(15,23,42,0.06)] dark:ring-0 min-[1180px]:h-full min-[1180px]:self-stretch">
              <CardHeader className="p-2.5 pb-1">
                <CardTitle>Team members</CardTitle>
              </CardHeader>
              <CardContent className="flex min-h-0 flex-1 flex-col gap-1.5 px-2 pb-0 pt-0">
                <div className="grid gap-2 rounded-[8px] bg-[#f8fafc]/70 p-1.5 dark:bg-white/[0.025] min-[900px]:grid-cols-[minmax(240px,1fr)_auto] min-[900px]:items-center">
                  <div className="relative min-w-0">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748b] dark:text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      aria-label="Search team members by name"
                      className="h-8 border-transparent bg-white/95 pl-9 text-sm ring-0 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.18)] dark:border-transparent dark:bg-[#111d2d] dark:ring-0"
                      placeholder="Search by name"
                      value={userSearch}
                      onChange={(event) => setUserSearch(event.target.value)}
                    />
                  </div>

                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <label className="inline-flex h-8 min-w-0 items-center gap-2 rounded-[7px] px-2 text-xs font-semibold text-[#475569] dark:text-muted-foreground min-[900px]:hidden">
                      <Checkbox
                        checked={allVisibleUsersSelected}
                        disabled={visibleUserIds.length === 0}
                        className={teamMemberCheckboxClass}
                        aria-label="Select all visible team members"
                        onChange={(event) =>
                          toggleVisibleUserSelection(event.target.checked)
                        }
                      />
                      <span className="whitespace-nowrap">Select all</span>
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="ml-auto h-8 min-w-[104px] justify-start whitespace-nowrap bg-white px-2 text-xs dark:bg-[#0f1b2a]"
                      onClick={() => {
                        setNameSortDirection((current) =>
                          current === "asc" ? "desc" : "asc",
                        );
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
                  </div>
                </div>

                <div
                  aria-label="Team member assignments"
                  className="reference-paginated-viewport reference-visible-rows-viewport reference-team-member-viewport space-y-1 pr-1 min-[1180px]:mt-1"
                >
                  <div
                    className={cn(
                      "reference-team-member-header sticky top-0 z-10 hidden bg-white px-2 text-left text-[10px] font-semibold uppercase tracking-[0.04em] text-[#64748b] dark:bg-[#0f1b2a] dark:text-muted-foreground min-[900px]:grid",
                      "reference-team-member-row-grid",
                    )}
                  >
                    <Checkbox
                      checked={allVisibleUsersSelected}
                      disabled={visibleUserIds.length === 0}
                      className={teamMemberCheckboxClass}
                      aria-label="Select visible team members"
                      onChange={(event) =>
                        toggleVisibleUserSelection(event.target.checked)
                      }
                    />
                    <span>Team member</span>
                    <span>Roles</span>
                    <span>Employee dept.</span>
                    <span>Reviewer dept.</span>
                  </div>
                  {filteredUsers.length === 0 ? (
                    <div className="rounded-[8px] bg-[#f8fafc] py-5 text-center text-xs text-[#64748b] dark:bg-[#0b1523]">
                      {users.length === 0
                        ? "No users have been created yet."
                        : "No team members match this search."}
                    </div>
                  ) : (
                    pagedUsers.map((user) => {
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
                      const userSelected = selectedUserIds.includes(user.id);

                      return (
                        <article
                          key={user.id}
                          aria-label={`${userLabel} assignments`}
                          data-selected={userSelected}
                          className={cn(
                            "reference-team-member-row-grid cursor-pointer rounded-[8px] bg-[#f8fafc]/82 px-2 py-1.5 shadow-[0_4px_14px_rgba(15,23,42,0.028)] transition-colors hover:bg-[#f4f8ff] dark:bg-white/[0.035] dark:hover:bg-blue-400/10 min-[900px]:min-h-14",
                            userSelected &&
                              "bg-[#eef6ff] ring-1 ring-[#bfdbfe] shadow-[0_4px_14px_rgba(15,23,42,0.04)] dark:bg-blue-400/10 dark:ring-blue-300/25",
                          )}
                          onClick={(event) => selectUserFromRow(user.id, event)}
                        >
                          <Checkbox
                            checked={userSelected}
                            className={teamMemberCheckboxClass}
                            onChange={(event) =>
                              toggleUserSelection(
                                user.id,
                                event.target.checked,
                              )
                            }
                            onClick={(event) => event.stopPropagation()}
                            onKeyDown={(event) => event.stopPropagation()}
                            aria-label={`Select ${userLabel}`}
                          />
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
                          <div className="col-span-2 min-[900px]:col-span-1">
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
                          </div>

                          <div className="col-span-2 min-[900px]:col-span-1">
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
                          </div>

                          <div className="col-span-2 min-[900px]:col-span-1">
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
                <PaginationControls
                  className="reference-paginated-footer px-2 pb-2 pt-4"
                  page={currentUserPage}
                  pageSize={userPageSize}
                  pageSizeMenuPlacement="top"
                  totalItems={filteredUsers.length}
                  itemLabel="team members"
                  onPageChange={setUserPage}
                  onPageSizeChange={(nextPageSize) => {
                    setUserPageSize(nextPageSize);
                    setUserPage(1);
                  }}
                />
              </CardContent>
            </Card>
          ) : null}

          <div
            aria-label={
              section === "team" ? "Team member admin actions" : undefined
            }
            className={cn(
              "min-w-0 space-y-2",
              section === "team" &&
                "min-[1180px]:grid min-[1180px]:h-full min-[1180px]:min-h-0 min-[1180px]:grid-rows-[auto_minmax(0,1fr)] min-[1180px]:content-stretch min-[1180px]:gap-2 min-[1180px]:space-y-0",
              section === "departments" &&
                "min-[900px]:flex min-[900px]:h-full min-[900px]:min-h-0 min-[900px]:flex-col min-[900px]:space-y-0",
            )}
          >
            {section === "team" ? (
              <Card className="ring-0 shadow-[0_12px_34px_rgba(15,23,42,0.055)] dark:ring-0">
                <CardHeader className="p-2 pb-1">
                  <CardTitle>Create team member</CardTitle>
                </CardHeader>
                <CardContent className="p-2 pt-0">
                  <form className="space-y-1.5" onSubmit={createUser}>
                    <div className="space-y-0.5">
                      <Label htmlFor="name" className="text-xs">
                        Name
                      </Label>
                      <Input
                        id="name"
                        className="h-8 text-xs"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                      />
                    </div>
                    <div className="space-y-0.5">
                      <Label htmlFor="email" className="text-xs">
                        Email
                      </Label>
                      <Input
                        id="email"
                        type="email"
                        className="h-8 text-xs"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-0.5">
                      <Label className="text-xs">Roles</Label>
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
            ) : null}

            {section === "team" ? (
              <Card className="ring-0 shadow-[0_12px_34px_rgba(15,23,42,0.055)] dark:ring-0 min-[1180px]:self-start">
                <CardHeader className="flex flex-row items-center justify-between gap-2 p-2 pb-1">
                  <CardTitle>Actions</CardTitle>
                  <span className="rounded-[999px] bg-[#eef4ff] px-2 py-0.5 text-[11px] font-semibold text-[#2563eb] dark:bg-blue-400/10 dark:text-[#bfdbfe]">
                    {selectedUsers.length} selected
                  </span>
                </CardHeader>
                <CardContent className="space-y-2 p-2 pt-0">
                  <fieldset className="grid gap-0.5">
                    <legend className="sr-only">Team actions</legend>
                    {teamBulkActionOptions.map((action) => {
                      const checked = selectedTeamActions.includes(
                        action.value,
                      );
                      const disabled =
                        isApplyingTeamActions ||
                        Boolean(action.disabled) ||
                        (action.exclusive
                          ? nonExclusiveTeamActionSelected
                          : removeActionSelected);

                      return (
                        <label
                          key={action.value}
                          className={cn(
                            "flex h-8 items-center gap-2 rounded-[7px] px-2 text-xs font-semibold transition-colors",
                            !disabled &&
                              "cursor-pointer hover:bg-[#f4f8ff] dark:hover:bg-white/[0.05]",
                            checked &&
                              "bg-[#eff6ff] text-[#1d4ed8] dark:bg-blue-400/10 dark:text-[#bfdbfe]",
                            action.danger &&
                              "text-red-700 dark:text-red-200",
                            action.danger &&
                              checked &&
                              "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-200",
                            disabled && "opacity-55",
                          )}
                        >
                          <Checkbox
                            checked={checked}
                            disabled={disabled}
                            tone={action.danger ? "danger" : "default"}
                            className={teamActionCheckboxClass}
                            onChange={(event) =>
                              toggleTeamAction(
                                action.value,
                                event.target.checked,
                              )
                            }
                            aria-label={action.label}
                          />
                          <span className="min-w-0 truncate">
                            {action.label}
                          </span>
                        </label>
                      );
                    })}
                  </fieldset>
                  <Button
                    type="button"
                    className={cn(
                      "h-8 w-full text-xs",
                      removeActionSelected
                        ? "bg-red-600 hover:bg-red-700"
                        : "bg-[#2563eb] hover:bg-[#1d4ed8]",
                    )}
                    disabled={
                      selectedUsers.length === 0 ||
                      selectedTeamActions.length === 0 ||
                      isApplyingTeamActions
                    }
                    onClick={applyTeamActions}
                  >
                    {isApplyingTeamActions ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : removeActionSelected ? (
                      <Ban className="mr-1.5 h-3.5 w-3.5" />
                    ) : (
                      <KeyRound className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    {isApplyingTeamActions ? "Applying..." : "Apply"}
                  </Button>
                </CardContent>
              </Card>
            ) : null}

            {section === "departments" ? (
              <Card
                className={cn(
                  "reference-paginated-surface ring-0 shadow-[0_12px_34px_rgba(15,23,42,0.055)] dark:ring-0",
                  section === "departments" &&
                    "min-[900px]:flex min-[900px]:h-full min-[900px]:min-h-0 min-[900px]:flex-1 min-[900px]:flex-col",
                )}
              >
                <CardHeader className="p-2.5 pb-1.5">
                  <CardTitle>Departments</CardTitle>
                  <CardDescription className="text-xs leading-4">
                    Create departments, then assign employees and reviewer
                    access from Team members.
                  </CardDescription>
                </CardHeader>
                <CardContent
                  className={cn(
                    "flex min-h-0 flex-1 flex-col gap-2 p-2 pt-0",
                    section === "departments" &&
                      "min-[900px]:min-h-0 min-[900px]:flex-1",
                  )}
                >
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
                    className={cn(
                      "reference-paginated-viewport pr-1",
                      section === "departments" ? "min-h-0 flex-1" : "max-h-40",
                    )}
                  >
                    {departments.length === 0 ? (
                      <span className="text-xs text-[#64748b] dark:text-muted-foreground">
                        No departments created yet.
                      </span>
                    ) : (
                      <div className="grid gap-1.5">
                        {pagedDepartments.map((department) => (
                          <div
                            key={department.id}
                            className="flex min-w-0 items-center gap-1.5 rounded-[8px] bg-[#f8fafc] px-2 py-1.5 ring-1 ring-[#e2e8f0] dark:bg-white/[0.04] dark:ring-white/[0.08]"
                            title={department.name}
                          >
                            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[#334155] dark:text-foreground">
                              {department.name}
                            </span>
                            <button
                              type="button"
                              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] text-[#64748b] transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:pointer-events-none disabled:opacity-50 dark:text-muted-foreground dark:hover:bg-red-400/10 dark:hover:text-red-300"
                              aria-label={`Remove ${department.name} department`}
                              title={`Remove ${department.name} department`}
                              disabled={
                                deletingDepartmentId !== null || isSavingPage
                              }
                              onClick={() => setDepartmentToDelete(department)}
                            >
                              {deletingDepartmentId === department.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <PaginationControls
                    className="reference-paginated-footer px-1 pb-0 pt-2"
                    page={currentDepartmentPage}
                    pageSize={departmentPageSize}
                    pageSizeMenuPlacement="top"
                    totalItems={departments.length}
                    itemLabel="departments"
                    onPageChange={setDepartmentPage}
                    onPageSizeChange={(nextPageSize) => {
                      setDepartmentPageSize(nextPageSize);
                      setDepartmentPage(1);
                    }}
                  />
                  {departmentToDelete ? (
                    <div
                      className="rounded-[8px] bg-red-50 p-2 ring-1 ring-red-200 dark:bg-red-400/10 dark:ring-red-400/25"
                      aria-live="polite"
                    >
                      <div className="text-xs font-semibold text-red-700 dark:text-red-200">
                        Remove {departmentToDelete.name}?
                      </div>
                      <p className="mt-1 text-xs leading-4 text-red-700/85 dark:text-red-100/80">
                        This removes it from employee and reviewer assignments.
                        Users and reports stay intact.
                      </p>
                      <div className="mt-2 flex justify-end gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-7 bg-white px-2 text-xs dark:bg-[#0f1b2a]"
                          disabled={deletingDepartmentId !== null}
                          onClick={() => setDepartmentToDelete(null)}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          className="h-7 px-2 text-xs"
                          disabled={deletingDepartmentId !== null}
                          onClick={() => deleteDepartment(departmentToDelete)}
                        >
                          {deletingDepartmentId === departmentToDelete.id ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          Delete
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>
      </AdminSectionFrame>
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
  credentials: TemporaryCredential[] | null;
  onCopy: () => void;
  onDismiss: () => void;
}) {
  if (!credentials?.length) {
    return null;
  }

  const multipleCredentials = credentials.length > 1;
  const firstCredentials = credentials[0];

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
            {multipleCredentials
              ? "Temporary sign-in passwords"
              : "Temporary sign-in password"}
          </div>
          <p className="mt-1 text-[#475569] dark:text-muted-foreground">
            {multipleCredentials
              ? `${credentials.length} temporary passwords were generated.`
              : emailDeliveryMessage(firstCredentials.emailDelivery)}{" "}
            They will be asked to change it after signing in.
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

      <div className="mt-3 max-h-72 overflow-y-auto pr-1 [scrollbar-gutter:stable]">
        <div className="grid gap-2">
          {credentials.map((credential) => (
            <div
              key={`${credential.email}-${credential.password}`}
              className="grid gap-2 rounded-[8px] bg-[#f7f9fc] p-2 ring-1 ring-[#dbe5f4] dark:bg-white/[0.04] dark:ring-white/[0.08] sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
            >
              <div className="min-w-0">
                <div className="text-xs font-medium uppercase tracking-wide text-[#64748b] dark:text-muted-foreground">
                  Email
                </div>
                <div className="mt-1 break-all font-mono text-[#111827] dark:text-foreground">
                  {credential.email || "-"}
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium uppercase tracking-wide text-[#64748b] dark:text-muted-foreground">
                  Password
                </div>
                <div className="mt-1 break-all font-mono text-[#111827] dark:text-foreground">
                  {credential.password}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex justify-end">
        <Button
          variant="outline"
          className="h-9 bg-white dark:bg-white/[0.04]"
          onClick={onCopy}
        >
          <Copy className="mr-2 h-4 w-4" />
          {multipleCredentials ? "Copy passwords" : "Copy password"}
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
          triggerClassName={cn("h-8 text-xs", dirty && dirtyControlClassName)}
        />
      )}
    </>
  );
}
