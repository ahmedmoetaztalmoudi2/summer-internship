import { test, expect } from "@playwright/test";

test.describe('Connexion utilisateur', () => {
  test('Connexion échouée avec mot de passe incorrect', async ({ page }) => {
    await page.goto('https://teskerti.tn/user/login');
    await page.locator('input[name="email"]').fill('mellitisabaa@gmail.com');
    // TODO: 
    await page.locator('button:has-text("Se connecter"), button[type="submit"]').click();
    await expect(page.locator('.alert-danger, .error-message, [class*="error"], [role="alert"]').first()).toBeVisible();
  });
});
