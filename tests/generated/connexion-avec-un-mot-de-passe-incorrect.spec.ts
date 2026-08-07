import { test, expect } from "@playwright/test";

test.describe("Connexion utilisateur", () => {
  test("Connexion avec un mot de passe incorrect", async ({ page }) => {
    // Given
    await page.goto("https://teskerti.tn/user/login");

    // When
    await page.locator("input[name=\"email\"]").fill("mellitisabaa@gmail.com");
    await page.locator("input[name=\"password\"]").fill("wrongpassword");
    await page.locator("button:has-text(\"Se connecter\")").click();

    // Then
    await expect(page.locator(".alert, .error, [role=\"alert\"], .flash, .message").first()).toBeVisible();
  });
});
