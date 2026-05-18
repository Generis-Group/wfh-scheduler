import { expect, test } from "@playwright/test";

test("login page renders the credentials and OAuth entrypoints", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Google" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Atlassian" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View as Employee" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View as Admin/Reviewer" })).toBeVisible();
});

test("employee preview supports daily entry summary helpers", async ({ page }) => {
  await page.goto("/preview/employee?date=2026-05-18");

  await expect(page.getByRole("heading", { name: "Daily Update" })).toBeVisible();
  await page.getByRole("button", { name: "Next day" }).click();
  await expect(page).toHaveURL(/date=2026-05-19/);
  await page.getByRole("button", { name: "Previous day" }).click();
  await expect(page).toHaveURL(/date=2026-05-18/);
  await page.getByLabel("Select report date").fill("2026-05-20");
  await expect(page).toHaveURL(/date=2026-05-20/);

  await page.getByRole("button", { name: /More actions for Client coordination/ }).click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  const menuBox = await menu.boundingBox();
  const viewport = page.viewportSize();
  expect(menuBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(viewport!.width);
  expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(viewport!.height);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Generate from selected" }).click();
  await expect(page.getByPlaceholder("What did you work on today?")).toHaveValue(/Task: Project planning update/);

  await page.getByLabel("Blockers").fill("Waiting for approval");
  await expect(page.getByPlaceholder("What did you work on today?")).toHaveValue(/Blocker: Waiting for approval/);

  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Preview saved.")).toBeVisible();
});

test("preview pages render the main employee and admin workspaces", async ({ page }) => {
  await page.goto("/preview/reports");
  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
  await page.getByRole("button", { name: "Open" }).first().click();
  await expect(page.getByRole("button", { name: "Back to reports" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Report$/ })).toBeVisible();
  await page.getByRole("button", { name: "Back to reports" }).click();
  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();

  await page.goto("/preview/admin");
  await expect(page.getByRole("heading", { name: "Review Dashboard" })).toBeVisible();

  await page.goto("/preview/employees");
  await expect(page.getByRole("heading", { name: "Employees" })).toBeVisible();

  await page.goto("/preview/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
});
