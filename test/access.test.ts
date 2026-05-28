import { beforeEach, describe, expect, it, vi } from "vitest";

import { auth } from "@/lib/auth";
import { HttpError } from "@/lib/http";
import { assertCanReviewReport, canAccessUser, canMutateReport, requireRole, requireSession } from "@/lib/access";

const { mockCanReviewEmployee } = vi.hoisted(() => ({
  mockCanReviewEmployee: vi.fn()
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn()
}));

vi.mock("@/lib/services/departments", () => ({
  canReviewEmployee: mockCanReviewEmployee
}));

const mockedAuth = vi.mocked(auth);

function session(role: "EMPLOYEE" | "REVIEWER" | "ADMIN", patch: Record<string, unknown> = {}) {
  return {
    user: {
      id: "user-1",
      role,
      roles: [role],
      status: "ACTIVE",
      mustChangePassword: false,
      ...patch
    }
  } as Awaited<ReturnType<typeof auth>>;
}

describe("access guards", () => {
  beforeEach(() => {
    mockedAuth.mockReset();
    mockCanReviewEmployee.mockReset();
  });

  it("blocks disabled users", async () => {
    mockedAuth.mockResolvedValue(session("EMPLOYEE", { status: "DISABLED" }));

    await expect(requireSession()).rejects.toMatchObject({ status: 401 });
  });

  it("blocks temporary-password users except on allowed routes", async () => {
    mockedAuth.mockResolvedValue(session("EMPLOYEE", { mustChangePassword: true }));

    await expect(requireSession()).rejects.toMatchObject({ status: 403 });
    await expect(requireSession({ allowPasswordChangeRequired: true })).resolves.toMatchObject({
      user: { id: "user-1" }
    });
  });

  it("allows owners and admins through the synchronous user guard", () => {
    expect(canAccessUser(session("EMPLOYEE")!, "user-1")).toBe(true);
    expect(canAccessUser(session("ADMIN")!, "employee-1")).toBe(true);
    expect(canAccessUser(session("EMPLOYEE", { roles: ["EMPLOYEE", "ADMIN"] })!, "employee-1")).toBe(true);
    expect(canAccessUser(session("REVIEWER")!, "employee-1")).toBe(false);
    expect(canAccessUser(session("EMPLOYEE")!, "employee-1")).toBe(false);
  });

  it("allows only employee owners to mutate reports", () => {
    expect(canMutateReport(session("EMPLOYEE")!, { userId: "user-1" })).toBe(true);
    expect(canMutateReport(session("ADMIN", { roles: ["EMPLOYEE", "ADMIN"] })!, { userId: "user-1" })).toBe(true);
    expect(canMutateReport(session("EMPLOYEE")!, { userId: "employee-1" })).toBe(false);
    expect(canMutateReport(session("REVIEWER")!, { userId: "employee-1" })).toBe(false);
    expect(canMutateReport(session("ADMIN")!, { userId: "employee-1" })).toBe(false);
  });

  it("enforces role allow lists", async () => {
    mockedAuth.mockResolvedValue(session("EMPLOYEE"));

    await expect(requireRole(["REVIEWER", "ADMIN"])).rejects.toBeInstanceOf(HttpError);
  });

  it("allows additive roles through role allow lists", async () => {
    mockedAuth.mockResolvedValue(session("EMPLOYEE", { roles: ["EMPLOYEE", "REVIEWER"] }));

    await expect(requireRole(["REVIEWER", "ADMIN"])).resolves.toMatchObject({
      user: { id: "user-1" }
    });
  });

  it("does not let self-access bypass reviewer-scoped report access", async () => {
    mockCanReviewEmployee.mockResolvedValue(false);

    await expect(
      assertCanReviewReport(
        session("EMPLOYEE", { roles: ["EMPLOYEE", "REVIEWER"] })!,
        { userId: "user-1" }
      )
    ).rejects.toBeInstanceOf(HttpError);
    expect(mockCanReviewEmployee).toHaveBeenCalledWith(
      { userId: "user-1", roles: ["EMPLOYEE", "REVIEWER"] },
      "user-1"
    );
  });
});
