import { test, expect } from "@playwright/test";

test.describe("Filtre d'événements par salle et par date", () => {
  test("Recherche d'événements par salle et par date", async ({ page }) => {
    await page.goto("https://teskerti.tn/category/spectacle");

    await page.locator("#selectedSalle >> xpath=ancestor::div[contains(concat(' ',normalize-space(@class),' '),' choices ')][1] >> css=.choices__inner").click();
    await page.locator("#selectedSalle >> xpath=ancestor::div[contains(concat(' ',normalize-space(@class),' '),' choices ')][1] >> css=.choices__list--dropdown").getByText("<salle>", { exact: true }).click();

    await page.locator("#selectedDate >> xpath=ancestor::div[contains(concat(' ',normalize-space(@class),' '),' choices ')][1] >> css=.choices__inner").click();
    await page.locator("#selectedDate >> xpath=ancestor::div[contains(concat(' ',normalize-space(@class),' '),' choices ')][1] >> css=.choices__list--dropdown").getByText("<date>", { exact: true }).click();

    await page.locator("#filter").click();

    await expect(page.locator("#dynamic_data .tour_container").first()).toBeVisible();
  });
});
