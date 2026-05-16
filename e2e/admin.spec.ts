import { test, expect, login } from "./fixtures";

test.describe("Admin flow", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, "admin");
  });

  test("admin dashboard loads", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForLoadState("networkidle").catch(() => {});
    expect(page.url()).toContain("/admin");
    expect(page.url()).not.toContain("/login");
  });

  test("admin orders page loads", async ({ page }) => {
    await page.goto("/admin/orders");
    await page.waitForLoadState("networkidle").catch(() => {});
    expect(page.url()).toContain("/admin/orders");
  });

  test("admin vendors page loads", async ({ page }) => {
    await page.goto("/admin/vendors");
    await page.waitForLoadState("networkidle").catch(() => {});
    expect(page.url()).toContain("/admin/vendors");
  });

  test("admin products page loads", async ({ page }) => {
    await page.goto("/admin/products");
    await page.waitForLoadState("networkidle").catch(() => {});
    expect(page.url()).toContain("/admin/products");
  });

  test("admin categories page loads", async ({ page }) => {
    await page.goto("/admin/categories");
    await page.waitForLoadState("networkidle").catch(() => {});
    expect(page.url()).toContain("/admin/categories");
  });

  test("admin customers page loads", async ({ page }) => {
    await page.goto("/admin/customers");
    await page.waitForLoadState("networkidle").catch(() => {});
    expect(page.url()).toContain("/admin/customers");
  });

  test("buyer cannot access admin dashboard", async ({ page, context }) => {
    // Clear admin session, log in as buyer
    await context.clearCookies();
    await page.evaluate(() => localStorage.clear());
    await login(page, "buyer");
    await page.goto("/admin");
    await page.waitForLoadState("networkidle").catch(() => {});
    // Should be redirected away from /admin (to /, /login, or 403)
    const url = page.url();
    const blocked = !url.endsWith("/admin") || (await page.locator("text=/forbidden|interdit|non autoris/i").count()) > 0;
    expect(blocked).toBeTruthy();
  });
});
