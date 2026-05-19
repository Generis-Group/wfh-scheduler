import { expect, test } from "@playwright/test";

test("login page renders without bypass actions", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("link", { name: /view as/i })).toHaveCount(0);
});
