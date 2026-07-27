import { test, expect } from "@playwright/test";

// Public-page smoke tests — no auth required. These verify the app boots, the
// PWA manifest is wired, and the auth gate redirects protected routes.

test("login page renders", async ({ page }) => {
  await page.goto("/login");
  // The login page should show an email field to sign in.
  await expect(page.locator('input[type="email"]')).toBeVisible();
});

test("PWA manifest is served", async ({ request }) => {
  const res = await request.get("/manifest.json");
  expect(res.ok()).toBeTruthy();
  const manifest = await res.json();
  expect(manifest.name ?? manifest.short_name).toBeTruthy();
  expect(Array.isArray(manifest.icons)).toBeTruthy();
});

test("dashboard redirects unauthenticated users to login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});
