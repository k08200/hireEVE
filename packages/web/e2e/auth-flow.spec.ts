import { expect, test } from "@playwright/test";

test.describe("Authentication flow — error states and validation", () => {
  test("invalid email format shows validation", async ({ page }) => {
    await page.goto("/login");
    const emailInput = page.locator('input[type="email"]');
    await emailInput.fill("not-an-email");
    // HTML5 validation should mark it invalid
    const isValid = await emailInput.evaluate((el: HTMLInputElement) => el.validity.valid);
    expect(isValid).toBe(false);
  });

  test("empty password is blocked by browser validation", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[type="email"]').fill("test@example.com");
    const submitBtn = page.locator('button:has-text("Sign in")');
    await submitBtn.click();
    // Should still be on login page (validation blocked submission)
    await expect(page).toHaveURL(/\/login/);
  });

  test("register mode requires name field", async ({ page }) => {
    await page.goto("/login");
    await page.click("text=Don't have an account? Sign up");
    const nameInput = page.locator('input[id="name"]');
    await expect(nameInput).toBeVisible();
    const required = await nameInput.getAttribute("required");
    expect(required).not.toBeNull();
  });

  test("forgot password link leads to reset flow", async ({ page }) => {
    await page.goto("/login");
    await page.click("text=Forgot password?");
    // Should navigate to reset-password or show reset form
    await page.waitForTimeout(500);
    const url = page.url();
    expect(url).toMatch(/reset|forgot/);
  });

  test("toggle between sign in and sign up preserves layout", async ({ page }) => {
    await page.goto("/login");
    const signInBtn = page.locator('button:has-text("Sign in")');
    await expect(signInBtn).toBeVisible();

    await page.click("text=Don't have an account? Sign up");
    const createBtn = page.locator('button:has-text("Create account")');
    await expect(createBtn).toBeVisible();

    // Toggle back
    await page.click("text=Already have an account? Sign in");
    await expect(signInBtn).toBeVisible();
  });
});
