import { expect, test } from "@playwright/test";

test.describe("Static/public pages render without errors", () => {
  const publicPages = ["/", "/login", "/download"];

  for (const path of publicPages) {
    test(`${path} returns 2xx and has no console errors`, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });
      const response = await page.goto(path);
      expect(response?.status()).toBeLessThan(400);
      await page.waitForLoadState("networkidle");
      // Filter out expected errors (e.g. external analytics blocked)
      const realErrors = consoleErrors.filter(
        (e) => !e.includes("favicon") && !e.includes("analytics"),
      );
      expect(realErrors).toHaveLength(0);
    });
  }

  test("login page has accessible form labels", async ({ page }) => {
    await page.goto("/login");
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    // Either label or placeholder or aria-label must be present
    const emailLabel =
      (await emailInput.getAttribute("placeholder")) ||
      (await emailInput.getAttribute("aria-label"));
    const passwordLabel =
      (await passwordInput.getAttribute("placeholder")) ||
      (await passwordInput.getAttribute("aria-label"));
    expect(emailLabel).toBeTruthy();
    expect(passwordLabel).toBeTruthy();
  });
});
