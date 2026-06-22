import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockDepartmentCount,
  mockTransaction,
  mockUserDepartmentCreateMany,
  mockUserDepartmentDeleteMany,
  mockUserFindUniqueOrThrow,
  mockUserUpdate,
} = vi.hoisted(() => ({
  mockDepartmentCount: vi.fn(),
  mockTransaction: vi.fn(),
  mockUserDepartmentCreateMany: vi.fn(),
  mockUserDepartmentDeleteMany: vi.fn(),
  mockUserFindUniqueOrThrow: vi.fn(),
  mockUserUpdate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mockTransaction,
    department: {
      count: mockDepartmentCount,
    },
    user: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/services/account-emails", () => ({
  sendTemporaryPasswordEmail: vi.fn(),
}));

describe("admin user service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction.mockImplementation(async (callback) =>
      callback({
        user: {
          findUniqueOrThrow: mockUserFindUniqueOrThrow,
          update: mockUserUpdate,
        },
        userDepartment: {
          createMany: mockUserDepartmentCreateMany,
          deleteMany: mockUserDepartmentDeleteMany,
        },
      }),
    );
    mockUserFindUniqueOrThrow.mockResolvedValue({
      role: "EMPLOYEE",
      roles: ["EMPLOYEE"],
      reviewerAllDepartments: false,
      departments: [
        {
          departmentId: "dept-engineering",
          role: "EMPLOYEE",
        },
      ],
    });
    mockUserUpdate.mockResolvedValue({ id: "employee-1" });
    mockUserDepartmentCreateMany.mockResolvedValue({ count: 0 });
    mockUserDepartmentDeleteMany.mockResolvedValue({ count: 0 });
  });

  it("rejects invalid department ids before updating memberships", async () => {
    mockDepartmentCount.mockResolvedValue(0);
    const { updateAppUser } = await import("@/lib/services/admin");

    await expect(
      updateAppUser("employee-1", {
        employeeDepartmentIds: ["dept-missing"],
      }),
    ).rejects.toMatchObject({
      status: 422,
      message: "Select valid departments.",
    });

    expect(mockDepartmentCount).toHaveBeenCalledWith({
      where: { id: { in: ["dept-missing"] } },
    });
    expect(mockUserUpdate).not.toHaveBeenCalled();
    expect(mockUserDepartmentDeleteMany).not.toHaveBeenCalled();
    expect(mockUserDepartmentCreateMany).not.toHaveBeenCalled();
  });
});
