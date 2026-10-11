import { test, expect } from "@playwright/test";

       test.describe("Visualisation des détails d'un événement", () => {
         test("Affichage des prix des billets par catégorie", async ({ page }) => {
           // Given: the user is on the event listing page
           await page.goto("https://teskerti.tn/category/spectacle");

           // Given: the user is on the detailed event page
           // Click the first event card to navigate to details
           await page.locator("#dynamic_data .tour_container").first().click();
           await page.waitForLoadState("networkidle");

           // Then: the ticket prices by category in TND should be visible
           // TODO: Selector for ticket prices not provided in knownSelectors
           await expect(page.locator(".ticket-price, .price, [class*=\"price\"]").first()).toBeVisible();
         });
       });
