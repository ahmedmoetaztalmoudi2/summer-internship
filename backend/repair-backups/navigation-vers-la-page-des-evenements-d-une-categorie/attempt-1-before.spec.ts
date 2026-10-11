import { test, expect } from "@playwright/test";

test.describe("Consultation du programme mis en avant depuis la page d'accueil", () => {
  test("Navigation vers la page des événements d'une catégorie", async ({ page }) => {
    await page.goto("https://teskerti.tn");
    await page.locator("a.btn_search[href*=\"/category/spectacle\"]").click();
    await expect(page).toHaveURL(/\/category\/spectacle/);
  });
});
