import { expect, test } from "@playwright/test";

test("login page renders without bypass actions", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in with Atlassian" })).toBeVisible();
  await expect(page.getByRole("link", { name: /view as/i })).toHaveCount(0);
});
