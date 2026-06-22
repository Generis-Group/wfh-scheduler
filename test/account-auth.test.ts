import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  departmentCount,
  pendingSignupDeleteMany,
  pendingSignupFindUnique,
  pendingSignupUpsert,
  getEmailStatus,
  sendPasswordResetEmail,
  sendSignupVerificationEmail,
  userCreate,
  userFindUnique,
  userUpdate,
  verificationTokenCreate,
  verificationTokenDeleteMany,
  verificationTokenFindUnique,
} = vi.hoisted(() => ({
  departmentCount: vi.fn(),
  pendingSignupDeleteMany: vi.fn(),
  pendingSignupFindUnique: vi.fn(),
  pendingSignupUpsert: vi.fn(),
  getEmailStatus: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendSignupVerificationEmail: vi.fn(),
  userCreate: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  verificationTokenCreate: vi.fn(),
  verificationTokenDeleteMany: vi.fn(),
  verificationTokenFindUnique: vi.fn(),
}));

const prismaMock = vi.hoisted(() => ({
  department: {
    count: departmentCount,
  },
  pendingSignup: {
    deleteMany: pendingSignupDeleteMany,
    findUnique: pendingSignupFindUnique,
    upsert: pendingSignupUpsert,
  },
  user: {
    create: userCreate,
    findUnique: userFindUnique,
    update: userUpdate,
  },
  verificationToken: {
    create: verificationTokenCreate,
    deleteMany: verificationTokenDeleteMany,
    findUnique: verificationTokenFindUnique,
  },
  $transaction: vi.fn(async (callback: (tx: typeof prismaMock) => unknown) =>
    callback(prismaMock),
  ),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/email", () => ({
  appUrl: (path = "/") => `https://report.generisgp.com${path}`,
  getEmailStatus,
}));

vi.mock("@/lib/services/account-emails", () => ({
  sendPasswordResetEmail,
  sendSignupVerificationEmail,
}));

describe("self-service account auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userFindUnique.mockResolvedValue(null);
    userCreate.mockResolvedValue({ id: "user-1" });
    userUpdate.mockResolvedValue({ id: "user-1" });
    departmentCount.mockResolvedValue(1);
    pendingSignupUpsert.mockResolvedValue({});
    pendingSignupFindUnique.mockResolvedValue(null);
    pendingSignupDeleteMany.mockResolvedValue({ count: 0 });
    getEmailStatus.mockReturnValue({
      configured: true,
      provider: "Resend",
      from: "Generis Reports <reports@generisgp.com>",
    });
    verificationTokenCreate.mockResolvedValue({});
    verificationTokenDeleteMany.mockResolvedValue({ count: 0 });
    verificationTokenFindUnique.mockResolvedValue(null);
    sendSignupVerificationEmail.mockResolvedValue({
      status: "SENT",
      providerMessageId: "email-1",
    });
    sendPasswordResetEmail.mockResolvedValue({
      status: "SENT",
      providerMessageId: "email-1",
    });
  });

  it("stores a pending signup and sends verification without creating a user", async () => {
    const { requestSelfServiceSignup } = await import(
      "@/lib/services/account-auth"
    );

    await requestSelfServiceSignup({
      email: "Employee@GenerisGP.com",
      name: "Employee",
      password: "password123",
      departmentIds: ["dept-it"],
    });

    expect(pendingSignupUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: "employee@generisgp.com" },
        create: expect.objectContaining({
          email: "employee@generisgp.com",
          name: "Employee",
          passwordHash: expect.any(String),
          departmentIds: ["dept-it"],
        }),
      }),
    );
    expect(verificationTokenCreate).toHaveBeenCalled();
    expect(sendSignupVerificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        user: { email: "employee@generisgp.com", name: "Employee" },
        verificationUrl: expect.stringContaining(
          "/api/auth/signup/verify?",
        ),
      }),
    );
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("rejects signup when the verification email cannot be sent", async () => {
    sendSignupVerificationEmail.mockResolvedValue({
      status: "SKIPPED",
      reason: "Resend email is not configured.",
    });
    const { requestSelfServiceSignup } = await import(
      "@/lib/services/account-auth"
    );

    await expect(
      requestSelfServiceSignup({
        email: "employee@generisgp.com",
        password: "password123",
        departmentIds: ["dept-it"],
      }),
    ).rejects.toMatchObject({
      status: 503,
    });
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("creates an active user only after the signup token is verified", async () => {
    const expires = new Date(Date.now() + 1000 * 60);
    pendingSignupFindUnique.mockResolvedValue({
      email: "employee@generisgp.com",
      name: "Employee",
      passwordHash: "hashed-password",
      departmentIds: ["dept-it"],
      expiresAt: expires,
    });
    verificationTokenFindUnique.mockResolvedValue({
      identifier: "signup:employee@generisgp.com",
      token: "hashed-token",
      expires,
    });
    const { verifySelfServiceSignup } = await import(
      "@/lib/services/account-auth"
    );

    await verifySelfServiceSignup({
      email: "employee@generisgp.com",
      token: "raw-token",
    });

    expect(userCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: "employee@generisgp.com",
        name: "Employee",
        emailVerified: expect.any(Date),
        role: "EMPLOYEE",
        roles: ["EMPLOYEE"],
        status: "ACTIVE",
        passwordHash: "hashed-password",
        mustChangePassword: false,
        departments: {
          create: [
            {
              departmentId: "dept-it",
              role: "EMPLOYEE",
            },
          ],
        },
      }),
    });
    expect(pendingSignupDeleteMany).toHaveBeenCalledWith({
      where: { email: "employee@generisgp.com" },
    });
  });

  it("sends a password reset link for active users", async () => {
    userFindUnique.mockResolvedValue({
      email: "employee@generisgp.com",
      name: "Employee",
      status: "ACTIVE",
    });
    const { requestPasswordReset } = await import(
      "@/lib/services/account-auth"
    );

    await requestPasswordReset({ email: "employee@generisgp.com" });

    expect(verificationTokenCreate).toHaveBeenCalled();
    expect(sendPasswordResetEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({ email: "employee@generisgp.com" }),
        resetUrl: expect.stringContaining("/reset-password?"),
      }),
    );
  });

  it("does not send or reveal a password reset email for unavailable accounts", async () => {
    const { requestPasswordReset } = await import(
      "@/lib/services/account-auth"
    );

    await expect(
      requestPasswordReset({ email: "missing@generisgp.com" }),
    ).resolves.toEqual({ emailSent: false });

    expect(verificationTokenCreate).not.toHaveBeenCalled();
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("rejects password reset before account lookup when email is not configured", async () => {
    getEmailStatus.mockReturnValue({
      configured: false,
      provider: "Resend",
      from: "Generis Reports <reports@generisgp.com>",
    });
    const { requestPasswordReset } = await import(
      "@/lib/services/account-auth"
    );

    await expect(
      requestPasswordReset({ email: "employee@generisgp.com" }),
    ).rejects.toMatchObject({
      status: 503,
    });
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it("keeps password reset delivery failures generic after account lookup", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    userFindUnique.mockResolvedValue({
      email: "employee@generisgp.com",
      name: "Employee",
      status: "ACTIVE",
    });
    sendPasswordResetEmail.mockResolvedValue({
      status: "FAILED",
      error: "Resend failed.",
    });
    const { requestPasswordReset } = await import(
      "@/lib/services/account-auth"
    );

    await expect(
      requestPasswordReset({ email: "employee@generisgp.com" }),
    ).resolves.toEqual({ emailSent: false });
    expect(consoleError).toHaveBeenCalledWith(
      "Password reset email delivery failed.",
      { error: "Resend failed." },
    );
  });

  it("updates the password after reset token verification", async () => {
    const expires = new Date(Date.now() + 1000 * 60);
    verificationTokenFindUnique.mockResolvedValue({
      identifier: "password-reset:employee@generisgp.com",
      token: "hashed-token",
      expires,
    });
    userFindUnique.mockResolvedValue({
      id: "user-1",
      status: "INVITED",
      emailVerified: null,
    });
    const { resetPasswordWithToken } = await import(
      "@/lib/services/account-auth"
    );

    await resetPasswordWithToken({
      email: "employee@generisgp.com",
      token: "raw-token",
      password: "password123",
    });

    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: expect.objectContaining({
        passwordHash: expect.any(String),
        mustChangePassword: false,
        status: "ACTIVE",
        emailVerified: expect.any(Date),
      }),
    });
  });
});
