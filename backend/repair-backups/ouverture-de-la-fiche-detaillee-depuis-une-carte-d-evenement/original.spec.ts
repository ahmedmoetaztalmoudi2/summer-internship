import { test, expect } from "@playwright/test";

   test.describe("Visualisation des détails d'un événement", () => {
     test("Ouverture de la fiche détaillée depuis une carte d'événement", async ({ page }) => {
       // Given: l'utilisateur est sur la page de résultats de recherche
       await page.goto("https://teskerti.tn");

       // When: l'utilisateur clique sur une carte d'événement
       // TODO: No known selector for event card. Using best-effort locator.
       await page.locator(".event-card, .card-event, [data-testid='event-card']").first().click();

       // Then: la fiche détaillée de l'événement doit s'ouvrir
       // TODO: No known selector for event detail page. Using best-effort locator.
       await expect(page.locator(".event-detail, #event-details, [data-testid='event-detail']")).toBeVisible();
     });
   });
