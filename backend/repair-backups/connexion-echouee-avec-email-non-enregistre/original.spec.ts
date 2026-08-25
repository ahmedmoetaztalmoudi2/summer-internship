import { test, expect } from "@playwright/test";

test.describe("Connexion utilisateur", () => {
  test("Connexion échouée avec email non enregistré", async ({ page }) => {
    await page.goto("https://teskerti.tn/user/login");
    // TODO: email (unregistered)
    await page.locator('input[name="email"]').fill("");
    // TODO: password
    await page.locator('input[name="password"]').fill("");
    await page.locator('button:has-text("Se connecter"), button[type="submit"]').click();
    await expect(page.locator(".alert-danger, .error-message, [class*=\"error\"], [role=\"alert\"]")).toBeVisible();
  });
});
