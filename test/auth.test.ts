import { beforeEach, describe, expect, it, vi } from "vitest";

const { accountFindUnique, userFindUnique } = vi.hoisted(() => ({
  accountFindUnique: vi.fn(),
  userFindUnique: vi.fn()
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
      findUnique: userFindUnique
    }
  }
}));

import { authOptions } from "@/lib/auth";

async function runOAuthSignIn({
  profileEmail,
  provider = "google",
  userEmail = "employee@generisgp.com"
}: {
  profileEmail?: string;
  provider?: "google" | "atlassian";
  userEmail?: string | null;
}) {
  const callback = authOptions.callbacks?.signIn;

  if (!callback) {
    throw new Error("Missing signIn callback.");
  }

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
    profile: profileEmail === undefined ? undefined : { email: profileEmail }
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  accountFindUnique.mockResolvedValue(null);
  userFindUnique.mockResolvedValue(null);
});

describe("auth OAuth sign-in", () => {
  it("allows an admin-created Generis user whose provider email matches", async () => {
    userFindUnique.mockResolvedValue({ email: "employee@generisgp.com", status: "ACTIVE" });

    await expect(runOAuthSignIn({ profileEmail: "Employee@GenerisGP.com" })).resolves.toBe(true);

    expect(userFindUnique).toHaveBeenCalledWith({
      where: { email: "employee@generisgp.com" },
      select: { email: true, status: true }
    });
  });

  it("blocks OAuth sign-in when the admin has not created the user", async () => {
    await expect(runOAuthSignIn({ profileEmail: "employee@generisgp.com" })).resolves.toBe(false);
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

  it("allows a linked OAuth account only when the provider email matches the app user", async () => {
    accountFindUnique.mockResolvedValue({
      user: { email: "employee@generisgp.com", status: "ACTIVE" }
    });

    await expect(runOAuthSignIn({ profileEmail: "employee@generisgp.com" })).resolves.toBe(true);
  });

  it("blocks a linked OAuth account when the provider email differs from the app user", async () => {
    accountFindUnique.mockResolvedValue({
      user: { email: "employee@generisgp.com", status: "ACTIVE" }
    });

    await expect(runOAuthSignIn({ profileEmail: "other@generisgp.com" })).resolves.toBe(false);

    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it("blocks a linked OAuth account for disabled app users", async () => {
    accountFindUnique.mockResolvedValue({
      user: { email: "employee@generisgp.com", status: "DISABLED" }
    });

    await expect(runOAuthSignIn({ profileEmail: "employee@generisgp.com", provider: "atlassian" })).resolves.toBe(false);
  });
});
