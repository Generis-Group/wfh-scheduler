import { expect, test } from "@playwright/test";

test("global stylesheet loads and applies", async ({ page }) => {
  await page.goto("/login");

  const stylesheetHrefs = await page.locator('link[rel="stylesheet"]').evaluateAll((links) =>
    links
      .map((link) => link.getAttribute("href"))
      .filter((href): href is string => Boolean(href))
  );

  expect(stylesheetHrefs.length).toBeGreaterThan(0);

  for (const href of stylesheetHrefs) {
    const response = await page.request.get(new URL(href, page.url()).toString());
    expect(response.status(), `${href} should load`).toBe(200);
    expect(response.headers()["content-type"], `${href} should be CSS`).toContain("text/css");
  }

  const mainStyles = await page.locator("main").evaluate((element) => {
    const styles = window.getComputedStyle(element);
    return {
      backgroundColor: styles.backgroundColor,
      display: styles.display
    };
  });

  expect(mainStyles.display).toBe("flex");
  expect(mainStyles.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
});
