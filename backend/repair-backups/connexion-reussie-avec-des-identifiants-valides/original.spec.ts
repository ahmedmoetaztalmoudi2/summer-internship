import { test, expect } from "@playwright/test";

test.describe('Connexion utilisateur', () => {
  test('Connexion réussie avec des identifiants valides', async ({ page }) => {
    await page.goto('https://teskerti.tn/user/login');
    await page.locator('input[name="email"]').fill('mellitisabaa@gmail.com');
    await page.locator('input[name="password"]').fill('123456789');
    await page.locator('button:has-text("Se connecter"), button[type="submit"]').click();
    await expect(page).toHaveURL('https://teskerti.tn/category/spectacle');
  });
});
