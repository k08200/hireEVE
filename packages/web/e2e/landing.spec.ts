import { expect, test } from "@playwright/test";

test.describe("Landing page", () => {
  test("displays hero with concept message", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toContainText("Connect once");
    await expect(page.locator("h1")).toContainText("EVE handles the rest");
  });

  test("shows Get Started Free button linking to login", async ({ page }) => {
    await page.goto("/");
    const cta = page.locator('a:has-text("Get Started Free")').first();
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", "/login");
  });

  test("shows How EVE works section with 3 pillars", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=1. Connect")).toBeVisible();
    await expect(page.locator("text=2. EVE decides")).toBeVisible();
    await expect(page.locator("text=3. EVE acts")).toBeVisible();
  });

  test("shows 24/7 difference section", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=EVE works while your computer is off")).toBeVisible();
  });

  test("shows autonomous actions", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Morning briefing")).toBeVisible();
    await expect(page.locator("text=Email triage")).toBeVisible();
    await expect(page.locator("text=Urgent alerts")).toBeVisible();
  });

  test("no pricing section visible", async ({ page }) => {
    await page.goto("/");
    // Pricing was removed per concept-first approach
    await expect(page.locator("text=$29/mo")).not.toBeVisible();
  });
});
