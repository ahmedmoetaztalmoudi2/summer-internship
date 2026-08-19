import { test, expect } from "@playwright/test";

test.describe("Filtre d'événements par salle et par date", () => {
  test("Affichage des menus déroulants", async ({ page }) => {
    await page.goto("https://teskerti.tn/category/spectacle");
    await expect(page.locator("#selectedSalle")).toBeVisible();
    await expect(page.locator("#selectedDate")).toBeVisible();
  });
});
