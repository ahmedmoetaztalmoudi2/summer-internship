import { test, expect } from "@playwright/test";

test.describe('Connexion utilisateur', () => {
  test('Mot de passe incorrect génère un message d\'erreur générique', async ({ page }) => {
    await page.goto('https://teskerti.tn/user/login');
    await page.locator('input[name="email"]').fill('user@example.com');
    await page.locator('input[name="password"]').fill('WrongPassword123!');
    await page.locator('button:has-text("Se connecter"), button[type="submit"]').click();
    await expect(page.locator('.alert-danger, .error-message, [class*="error"], [role="alert"]')).toHaveText('Identifiants invalides');
  });
});
