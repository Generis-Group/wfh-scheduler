import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

const { baseLinkAccount, prismaUserCreate } = vi.hoisted(() => ({
  baseLinkAccount: vi.fn(async (account: unknown) => account),
  prismaUserCreate: vi.fn(),
}));

vi.mock("@next-auth/prisma-adapter", () => ({
  PrismaAdapter: vi.fn(() => ({
    linkAccount: baseLinkAccount,
  })),
}));

describe("encryptedPrismaAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaUserCreate.mockResolvedValue({ id: "user-1" });
  });

  it("creates first-time OAuth users as active verified employees", async () => {
    const { encryptedPrismaAdapter } = await import("@/lib/auth-adapter");
    const adapter = encryptedPrismaAdapter({
      user: { create: prismaUserCreate },
    } as unknown as PrismaClient);

    await adapter.createUser?.({
      email: "Employee@GenerisGP.com",
      emailVerified: null,
      image: "https://example.com/avatar.png",
      name: "Employee",
    });

    expect(prismaUserCreate).toHaveBeenCalledWith({
      data: {
        email: "employee@generisgp.com",
        emailVerified: expect.any(Date),
        image: "https://example.com/avatar.png",
        mustChangePassword: false,
        name: "Employee",
        role: "EMPLOYEE",
        roles: ["EMPLOYEE"],
        status: "ACTIVE",
      },
    });
  });

  it("rejects first-time OAuth users outside the Generis domain", async () => {
    const { encryptedPrismaAdapter } = await import("@/lib/auth-adapter");
    const adapter = encryptedPrismaAdapter({
      user: { create: prismaUserCreate },
    } as unknown as PrismaClient);

    await expect(
      adapter.createUser?.({
        email: "employee@example.com",
        emailVerified: null,
        image: null,
        name: "Employee",
      }),
    ).rejects.toThrow("Only Generis email addresses can create accounts.");
    expect(prismaUserCreate).not.toHaveBeenCalled();
  });
});
