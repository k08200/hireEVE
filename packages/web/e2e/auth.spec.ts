import { expect, test } from "@playwright/test";

test.describe("Authentication", () => {
  test("login page loads with email and password fields", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button:has-text("Sign in")')).toBeVisible();
  });

  test("shows register mode toggle", async ({ page }) => {
    await page.goto("/login");
    const toggle = page.locator("text=Don't have an account? Sign up");
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(page.locator('button:has-text("Create account")')).toBeVisible();
    await expect(page.locator('input[id="name"]')).toBeVisible();
  });

  test("shows Google login button with Beta badge", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("text=Continue with Google")).toBeVisible();
    await expect(page.locator("text=Beta")).toBeVisible();
  });

  test("shows demo button", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('button:has-text("Try Demo")')).toBeVisible();
  });

  test("shows forgot password link", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("text=Forgot password?")).toBeVisible();
  });

  test("password field requires minimum 8 characters for registration", async ({ page }) => {
    await page.goto("/login");
    await page.click("text=Don't have an account? Sign up");
    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).toHaveAttribute("minLength", "8");
  });
});
