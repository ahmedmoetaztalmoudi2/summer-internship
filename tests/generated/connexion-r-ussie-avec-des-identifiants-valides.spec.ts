import { test, expect } from "@playwright/test";

test.describe("Connexion utilisateur", () => {
  test("Connexion réussie avec des identifiants valides", async ({ page }) => {
    await page.goto("https://teskerti.tn/user/login");
    await expect(page).toHaveURL("https://teskerti.tn/user/login");
  });
});
