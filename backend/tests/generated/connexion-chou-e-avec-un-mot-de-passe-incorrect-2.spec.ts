import { test, expect } from "@playwright/test";

test.describe("Authentification utilisateur", () => {
  test("Connexion échouée avec un mot de passe incorrect", async ({ page }) => {
    // TODO: No steps provided in Gherkin scenario
    await page.goto("https://teskerti.tn/");

    await page.locator("input[name=\"email\"]").fill("mellitisaba@gmail.com");
    await page.locator("input[name=\"password\"]").fill("123456789");
    await page.locator("button:has-text(\"Se connecter\"), button[type=\"submit\"]").click();

    await expect(page.locator(".alert, .error, [role=\"alert\"], .flash, .message").first()).toBeVisible();
  });
});
