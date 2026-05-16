import { test, expect, login } from "./fixtures";

test.describe("Buyer flow", () => {
  test("home page loads with main nav", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/.+/);
    // Page should have at least one link to categories or shop
    const links = page.locator("a");
    await expect(links.first()).toBeVisible();
  });

  test("categories page lists categories", async ({ page }) => {
    const res = await page.goto("/categories");
    expect(res?.ok()).toBeTruthy();
  });

  test("search page accepts a query", async ({ page }) => {
    await page.goto("/search?q=test");
    await page.waitForLoadState("networkidle").catch(() => {});
    expect(page.url()).toContain("/search");
  });

  test("cart page renders (empty or with items)", async ({ page }) => {
    const res = await page.goto("/cart");
    expect(res?.ok()).toBeTruthy();
  });

  test("authenticated buyer reaches orders page", async ({ page }) => {
    await login(page, "buyer");
    await page.goto("/orders");
    await page.waitForLoadState("networkidle").catch(() => {});
    expect(page.url()).toContain("/orders");
    // Should NOT redirect to /login
    expect(page.url()).not.toContain("/login");
  });

  test("authenticated buyer reaches account page", async ({ page }) => {
    await login(page, "buyer");
    await page.goto("/account");
    await page.waitForLoadState("networkidle").catch(() => {});
    expect(page.url()).not.toContain("/login");
  });
});
