// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LoginForm } from "@/components/auth/login-form";

const signInMock = vi.hoisted(() => vi.fn());

vi.mock("next-auth/react", () => ({
  signIn: signInMock,
}));

const oauthConfig = {
  google: true,
  atlassian: true,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("LoginForm", () => {
  it("lets employees request a verified email signup", async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    render(<LoginForm oauthConfig={oauthConfig} />);

    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Employee" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "employee@generisgp.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify email" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/auth/signup",
        expect.objectContaining({ method: "POST" }),
      );
    });
    expect(screen.getByText("Check your email to verify your account.")).toBeTruthy();
  });

  it("lets employees request a password reset email", async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    render(<LoginForm oauthConfig={oauthConfig} />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "employee@generisgp.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Forgot password" }));
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/auth/password-reset/request",
        expect.objectContaining({ method: "POST" }),
      );
    });
    expect(
      screen.getByText("If an active account exists, a reset link has been sent."),
    ).toBeTruthy();
  });
});
