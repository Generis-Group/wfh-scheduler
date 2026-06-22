import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "next-auth";

const { accountFindUnique, userFindUnique, userUpdate } = vi.hoisted(() => ({
  accountFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn()
}));

vi.mock("@/lib/auth-adapter", () => ({
  encryptedPrismaAdapter: vi.fn(() => ({}))
}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");

  return {
    ...actual,
    cache: <T extends (...args: never[]) => unknown>(callback: T) => callback
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    account: {
      findUnique: accountFindUnique
    },
    user: {
      findUnique: userFindUnique,
      update: userUpdate
    }
  }
}));

import { authOptions } from "@/lib/auth";

async function runOAuthSignIn({
  profileEmail,
  provider = "google",
  userEmail = "employee@generisgp.com",
  emailVerified = true,
}: {
  profileEmail?: string;
  provider?: "google" | "atlassian";
  userEmail?: string | null;
  emailVerified?: boolean;
}) {
  const callback = authOptions.callbacks?.signIn;

  if (!callback) {
    throw new Error("Missing signIn callback.");
  }

  const profile =
    profileEmail === undefined
      ? undefined
      : ((provider === "google"
          ? { email: profileEmail, email_verified: emailVerified }
          : { email: profileEmail }) as unknown as Profile);

  return callback({
    account: {
      provider,
      providerAccountId: "provider-user-1",
      type: "oauth"
    },
    user: {
      id: "user-1",
      email: userEmail,
      name: "Employee",
      image: null,
      role: "EMPLOYEE",
      status: "ACTIVE",
      mustChangePassword: false
    },
    profile
  });
}

async function runJwtCallback(token: Record<string, unknown>, user?: { id: string }) {
  const callback = authOptions.callbacks?.jwt;

  if (!callback) {
    throw new Error("Missing jwt callback.");
  }

  return callback({
    token,
    ...(user ? { user } : {}),
    account: null,
  } as unknown as Parameters<typeof callback>[0]);
}

beforeEach(() => {
  vi.clearAllMocks();
  accountFindUnique.mockResolvedValue(null);
  userFindUnique.mockResolvedValue(null);
  userUpdate.mockResolvedValue({});
});

describe("auth OAuth sign-in", () => {
  it("allows an admin-created Generis user whose provider email matches", async () => {
    userFindUnique.mockResolvedValue({
      id: "user-1",
      email: "employee@generisgp.com",
      status: "ACTIVE",
      emailVerified: new Date("2026-01-01T00:00:00.000Z"),
      mustChangePassword: false
    });

    await expect(runOAuthSignIn({ profileEmail: "Employee@GenerisGP.com" })).resolves.toBe(true);

    expect(userFindUnique).toHaveBeenCalledWith({
      where: { email: "employee@generisgp.com" },
      select: {
        id: true,
        email: true,
        status: true,
        emailVerified: true,
        mustChangePassword: true
      }
    });
  });

  it("blocks a verified Generis OAuth user when the app user does not exist", async () => {
    await expect(runOAuthSignIn({ profileEmail: "employee@generisgp.com" })).resolves.toBe(false);
  });

  it("blocks a Generis Atlassian OAuth user when the app user does not exist", async () => {
    await expect(
      runOAuthSignIn({
        profileEmail: "employee@generisgp.com",
        provider: "atlassian",
      }),
    ).resolves.toBe(false);
  });

  it("blocks OAuth sign-in for non-Generis provider emails before account lookup", async () => {
    await expect(runOAuthSignIn({ profileEmail: "employee@example.com" })).resolves.toBe(false);

    expect(accountFindUnique).not.toHaveBeenCalled();
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it("blocks OAuth sign-in when the provider does not return an email", async () => {
    await expect(runOAuthSignIn({ profileEmail: undefined })).resolves.toBe(false);

    expect(accountFindUnique).not.toHaveBeenCalled();
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it("blocks new Google OAuth sign-in when the provider email is not verified", async () => {
    await expect(
      runOAuthSignIn({
        profileEmail: "employee@generisgp.com",
        emailVerified: false
      }),
    ).resolves.toBe(false);

    expect(accountFindUnique).not.toHaveBeenCalled();
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it("allows a linked OAuth account only when the provider email matches the app user", async () => {
    accountFindUnique.mockResolvedValue({
      user: {
        id: "user-1",
        email: "employee@generisgp.com",
        status: "ACTIVE",
        emailVerified: new Date("2026-01-01T00:00:00.000Z"),
        mustChangePassword: false
      }
    });

    await expect(runOAuthSignIn({ profileEmail: "employee@generisgp.com" })).resolves.toBe(true);
  });

  it("blocks a linked OAuth account when the provider email differs from the app user", async () => {
    accountFindUnique.mockResolvedValue({
      user: {
        id: "user-1",
        email: "employee@generisgp.com",
        status: "ACTIVE",
        emailVerified: new Date("2026-01-01T00:00:00.000Z"),
        mustChangePassword: false
      }
    });

    await expect(runOAuthSignIn({ profileEmail: "other@generisgp.com" })).resolves.toBe(false);

    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it("blocks a linked OAuth account for disabled app users", async () => {
    accountFindUnique.mockResolvedValue({
      user: {
        id: "user-1",
        email: "employee@generisgp.com",
        status: "DISABLED",
        emailVerified: new Date("2026-01-01T00:00:00.000Z"),
        mustChangePassword: false
      }
    });

    await expect(runOAuthSignIn({ profileEmail: "employee@generisgp.com", provider: "atlassian" })).resolves.toBe(false);
  });

  it("activates an invited app user after verified OAuth sign-in", async () => {
    userFindUnique.mockResolvedValue({
      id: "user-1",
      email: "employee@generisgp.com",
      status: "INVITED",
      emailVerified: null,
      mustChangePassword: true
    });

    await expect(runOAuthSignIn({ profileEmail: "employee@generisgp.com" })).resolves.toBe(true);

    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        status: "ACTIVE",
        emailVerified: expect.any(Date),
        mustChangePassword: false
      }
    });
  });
});

describe("auth JWT session refresh", () => {
  it("clears app user claims when the stored user no longer exists", async () => {
    const token = await runJwtCallback({
      userId: "deleted-user",
      role: "EMPLOYEE",
      roles: ["EMPLOYEE"],
      status: "ACTIVE",
      mustChangePassword: false,
    });

    expect(userFindUnique).toHaveBeenCalledWith({
      where: { id: "deleted-user" },
    });
    expect(token).not.toHaveProperty("userId");
    expect(token).not.toHaveProperty("role");
    expect(token).not.toHaveProperty("roles");
    expect(token).not.toHaveProperty("status");
    expect(token).not.toHaveProperty("mustChangePassword");
  });
});
