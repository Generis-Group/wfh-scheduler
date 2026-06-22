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

  it("rejects first-time OAuth users before creating a departmentless account", async () => {
    const { encryptedPrismaAdapter } = await import("@/lib/auth-adapter");
    const adapter = encryptedPrismaAdapter({
      user: { create: prismaUserCreate },
    } as unknown as PrismaClient);

    await expect(
      adapter.createUser?.({
        email: "Employee@GenerisGP.com",
        emailVerified: null,
        image: "https://example.com/avatar.png",
        name: "Employee",
      }),
    ).rejects.toThrow(
      "Sign up with email and choose a department before using OAuth sign-in.",
    );
    expect(prismaUserCreate).not.toHaveBeenCalled();
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
