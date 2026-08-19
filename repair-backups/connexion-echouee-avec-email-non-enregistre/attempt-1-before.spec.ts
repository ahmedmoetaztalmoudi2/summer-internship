import { test, expect } from "@playwright/test";

test.describe("Connexion utilisateur", () => {
  test("Connexion échouée avec email non enregistré", async ({ page }) => {
    await page.goto("https://teskerti.tn/user/login");

    // TODO: enter unregistered email
    await page.getByLabel("Mot de passe").fill("123456789");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(
      page.locator(
        ".alert-danger, .error-message, [class*=\"error\"], [role=\"alert\"]"
      ).first()
    ).toBeVisible();
  });
});
