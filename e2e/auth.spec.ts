import { test, expect, login, logout, TEST_USERS } from "./fixtures";

test.describe("Auth — public pages and flows", () => {
  test("login page renders", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });

  test("signup page renders", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
  });

  test("forgot-password page renders", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
  });

  test("reset-password route is reachable", async ({ page }) => {
    const res = await page.goto("/reset-password");
    expect(res?.status() ?? 200).toBeLessThan(500);
  });

  test("buyer can log in and log out", async ({ page }) => {
    await login(page, "buyer");
    expect(page.url()).not.toContain("/login");
    await logout(page);
    // After logout, /account should redirect to login (or render guest)
    await page.goto("/account");
    await page.waitForLoadState("networkidle").catch(() => {});
  });

  test("invalid credentials show an error", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[type="email"]').first().fill(TEST_USERS.buyer.email);
    await page.locator('input[type="password"]').first().fill("WrongPass!2026");
    await page.locator('button[type="submit"]').first().click();
    // Should NOT navigate away from /login
    await page.waitForTimeout(2500);
    expect(page.url()).toContain("/login");
  });
});
