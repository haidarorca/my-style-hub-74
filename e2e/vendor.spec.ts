import { test, expect, login } from "./fixtures";

test.describe("Vendor flow", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, "vendor");
  });

  test("vendor dashboard loads", async ({ page }) => {
    await page.goto("/vendor");
    await page.waitForLoadState("networkidle").catch(() => {});
    expect(page.url()).toContain("/vendor");
    expect(page.url()).not.toContain("/login");
  });

  test("vendor products page loads", async ({ page }) => {
    await page.goto("/vendor/products");
    await page.waitForLoadState("networkidle").catch(() => {});
    expect(page.url()).not.toContain("/login");
  });

  test("vendor can open the new product form", async ({ page }) => {
    await page.goto("/vendor/products/new");
    await page.waitForLoadState("networkidle").catch(() => {});
    expect(page.url()).toContain("/vendor/products/new");
    // At least one form input should be present
    await expect(page.locator("input, textarea").first()).toBeVisible({ timeout: 10_000 });
  });

  test("vendor orders page loads", async ({ page }) => {
    await page.goto("/vendor/orders");
    await page.waitForLoadState("networkidle").catch(() => {});
    expect(page.url()).toContain("/vendor/orders");
  });

  test("vendor preparation page loads", async ({ page }) => {
    await page.goto("/vendor/preparation");
    await page.waitForLoadState("networkidle").catch(() => {});
    expect(page.url()).toContain("/vendor/preparation");
  });

  test("vendor settings page loads", async ({ page }) => {
    await page.goto("/vendor/settings");
    await page.waitForLoadState("networkidle").catch(() => {});
    expect(page.url()).not.toContain("/login");
  });
});
