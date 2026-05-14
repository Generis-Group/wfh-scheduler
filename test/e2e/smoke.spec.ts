import { expect, test } from "@playwright/test";

test("login page renders the credentials and OAuth entrypoints", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "Generis daily reporting" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Google" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Atlassian" })).toBeVisible();
});
