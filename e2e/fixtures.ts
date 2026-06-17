import { test as base, expect, type Page } from "@playwright/test";

export const TEST_USERS = {
  admin: { email: "e2e-admin@kawzone.test", password: "TestPass123!" },
  vendor: { email: "e2e-vendor@kawzone.test", password: "TestPass123!" },
  buyer: { email: "e2e-buyer@kawzone.test", password: "TestPass123!" },
} as const;

export type Role = keyof typeof TEST_USERS;

/**
 * Log a user in via the /login form.
 * Throws if the form is missing or login fails.
 */
export async function login(page: Page, role: Role) {
  const { email, password } = TEST_USERS[role];
  await page.goto("/login");

  // Wait for the email input — accept either name="email" or type="email"
  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  await emailInput.waitFor({ state: "visible" });
  await emailInput.fill(email);

  const passwordInput = page.locator('input[type="password"]').first();
  await passwordInput.fill(password);

  // Submit
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 }),
    page.locator('button[type="submit"]').first().click(),
  ]);
}

export async function logout(page: Page) {
  // Best-effort: clear localStorage (where supabase-js persists session)
  await page.evaluate(() => {
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith("sb-") || k.includes("supabase"))
        .forEach((k) => localStorage.removeItem(k));
    } catch {
      /* ignore */
    }
  });
  await page.goto("/");
}

export { expect };
export const test = base;
