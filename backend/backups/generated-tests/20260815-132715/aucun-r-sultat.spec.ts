import { test, expect } from "@playwright/test";

test.describe("Filtre d'événements par salle et par date", () => {
  test("Aucun résultat", async ({ page }) => {
    // Given l'utilisateur est sur la page de catégorie
    await page.goto("https://teskerti.tn/category/spectacle");

    // Given l'utilisateur sélectionne une salle qui n'a pas d'événements
    await page.locator("#selectedSalle >> xpath=ancestor::div[contains(concat(' ',normalize-space(@class),' '),' choices ')][1] >> css=.choices__inner").click();
    await page.locator("#selectedSalle >> xpath=ancestor::div[contains(concat(' ',normalize-space(@class),' '),' choices ')][1] >> css=.choices__list--dropdown").getByText("Salle sans événements", { exact: true }).click();

    // And l'utilisateur sélectionne une date qui n'a pas d'événements
    await page.locator("#selectedDate >> xpath=ancestor::div[contains(concat(' ',normalize-space(@class),' '),' choices ')][1] >> css=.choices__inner").click();
    await page.locator("#selectedDate >> xpath=ancestor::div[contains(concat(' ',normalize-space(@class),' '),' choices ')][1] >> css=.choices__list--dropdown").getByText("15 Août 2026", { exact: true }).click();

    // When l'utilisateur clique sur "Recherche"
    await page.locator("#filter").click();

    // Then aucun résultat ne devrait être affiché
    await expect(page.locator("#dynamic_data .tour_container")).toHaveCount(0);
  });
});
