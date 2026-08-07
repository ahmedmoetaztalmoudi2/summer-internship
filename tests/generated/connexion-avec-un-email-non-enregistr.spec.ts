import { test, expect } from "@playwright/test";

test.describe("Connexion utilisateur", () => {
  test("Connexion avec un email non enregistré", async ({ page }) => {
    // Given 
    await page.goto("https://teskerti.tn/user/login");

    // When 
    await page.locator("input[name=\"email\"]").fill("wrong@test.com");
    await page.locator("input[name=\"password\"]").fill("123456789");
    await page.locator("button:has-text(\"Se connecter\")").click();

    // Then 
    await expect(page.locator(".alert, .error, [role=\"alert\"], .flash, .message").first()).toBeVisible();
  });
});
