import { test, expect } from "@playwright/test";

test.describe('Pied de page du site', () => {
  test('Le pied de page affiche la liste des catégories et le lien "La liste de nos guichets"', async ({ page }) => {
    await page.goto("https://teskerti.tn/category/spectacle");
    // TODO:
    await expect(page.locator('footer').getByRole('list')).toBeVisible();
    await expect(page.getByRole('link', { name: 'La liste de nos guichets' })).toBeVisible();
  });
});
