import { test, expect } from "@playwright/test";

test.describe("Filtre d'événements par salle et par date", () => {
  test("Recherche d'événements par salle et par date", async ({ page }) => {
    // Given l'utilisateur est sur la page de catégorie
    await page.goto("https://teskerti.tn/category/spectacle");

    // Given l'utilisateur sélectionne une salle "Théâtre de plein air de Hammamet"
    await page
      .locator(
        '#selectedSalle >> xpath=ancestor::div[contains(concat(" ",normalize-space(@class)," ")," choices ")][1] >> css=.choices__inner'
      )
      .click();
    await page
      .locator(
        '#selectedSalle >> xpath=ancestor::div[contains(concat(" ",normalize-space(@class)," ")," choices ")][1] >> css=.choices__list--dropdown'
      )
      .getByText("Théâtre de plein air de Hammamet", { exact: true })
      .click();

    // And l'utilisateur sélectionne une date "15 Août 2026"
    await page
      .locator(
        '#selectedDate >> xpath=ancestor::div[contains(concat(" ",normalize-space(@class)," ")," choices ")][1] >> css=.choices__inner'
      )
      .click();
    await page
      .locator(
        '#selectedDate >> xpath=ancestor::div[contains(concat(" ",normalize-space(@class)," ")," choices ")][1] >> css=.choices__list--dropdown'
      )
      .getByText("15 Août 2026", { exact: true })
      .click();

    // When l'utilisateur clique sur "Recherche"
    await page.locator("#filter").click();

    // Then seuls les événements correspondants devraient être affichés
    await page.locator("#dynamic_data .tour_container").first().scrollIntoViewIfNeeded();
    await expect(page.locator("#dynamic_data .tour_container").first()).toBeVisible();
  });
});
