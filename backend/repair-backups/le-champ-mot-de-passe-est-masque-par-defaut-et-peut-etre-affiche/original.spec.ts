import { test, expect } from "@playwright/test";

test.describe("Connexion utilisateur", () => {
  test("Le champ mot de passe est masqué par défaut et peut être affiché", async ({ page }) => {
    // Given the user is on the login page
    await page.goto("https://teskerti.tn/user/login");
    // Given the user is on the login page (duplicate)
    await page.goto("https://teskerti.tn/user/login");
    // When the user views the password field
    await page.locator('input[name="password"]').focus();
    // Then the password field should be masked
    await expect(page.locator('input[name="password"]')).toHaveAttribute('type', 'password');
    // When the user clicks "Afficher le mot de passe"
    await page.locator('button[type="button"][class*="toggle"], .password-toggle, [data-toggle="password"]').click();
    // And the user enters "Secret123!" in the password field
    await page.locator('input[name="password"]').fill('Secret123!');
    // Then the password field should show the entered text
    await expect(page.locator('input[name="password"]')).toHaveValue('Secret123!');
  });
});
