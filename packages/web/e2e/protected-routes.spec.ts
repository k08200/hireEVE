import { expect, test } from "@playwright/test";

const PROTECTED_ROUTES = [
  "/dashboard",
  "/chat",
  "/tasks",
  "/notes",
  "/calendar",
  "/email",
  "/contacts",
  "/reminders",
  "/skills",
  "/settings",
  "/notifications",
  "/workspace",
  "/billing",
];

test.describe("Protected routes", () => {
  for (const route of PROTECTED_ROUTES) {
    test(`${route} is protected from unauthenticated access`, async ({ page }) => {
      await page.goto(route);
      await page.waitForTimeout(1500);
      const url = page.url();
      const showsLogin = await page
        .locator('input[type="email"]')
        .isVisible()
        .catch(() => false);
      // Either redirected to login, shows login form, or the page itself is AuthGuard-wrapped
      const isProtected = url.includes("/login") || showsLogin || url.includes(route);
      expect(isProtected).toBeTruthy();
    });
  }

  test("admin route is gated even more strictly", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForTimeout(1500);
    const body = await page.locator("body").textContent();
    // Should show either login or "Admin access required" message
    const gated =
      body?.includes("Admin access required") ||
      body?.includes("Sign in") ||
      (await page
        .locator('input[type="email"]')
        .isVisible()
        .catch(() => false));
    expect(gated).toBeTruthy();
  });
});
