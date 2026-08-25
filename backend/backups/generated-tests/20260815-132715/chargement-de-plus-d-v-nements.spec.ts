import { test, expect } from "@playwright/test";

test.describe("Filtre d'événements par salle et par date", () => {
  test("Chargement de plus d'événements", async ({ page }) => {
    await page.goto("https://teskerti.tn/category/spectacle");

    await page.locator("#load_more").click();

    await expect(page.locator("#dynamic_data .tour_container").first()).toBeVisible();
  });
});
