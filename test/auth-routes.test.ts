import { afterEach, describe, expect, it, vi } from "vitest";

const { requestPasswordReset, requestSelfServiceSignup } = vi.hoisted(() => ({
  requestPasswordReset: vi.fn(),
  requestSelfServiceSignup: vi.fn(),
}));

vi.mock("@/lib/services/account-auth", () => ({
  requestPasswordReset,
  requestSelfServiceSignup,
}));

afterEach(() => {
  vi.clearAllMocks();
});

function jsonRequest(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("public auth routes", () => {
  it("does not expose signup email delivery details", async () => {
    requestSelfServiceSignup.mockResolvedValue({ ok: true });
    const { POST } = await import("@/app/api/auth/signup/route");

    const response = await POST(
      jsonRequest("/api/auth/signup", {
        email: "employee@generisgp.com",
        password: "password123",
        departmentIds: ["dept-it"],
      }),
    );

    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("does not expose whether a reset email matched an account", async () => {
    requestPasswordReset.mockResolvedValue({ emailSent: false });
    const { POST } =
      await import("@/app/api/auth/password-reset/request/route");

    const response = await POST(
      jsonRequest("/api/auth/password-reset/request", {
        email: "missing@generisgp.com",
      }),
    );

    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
