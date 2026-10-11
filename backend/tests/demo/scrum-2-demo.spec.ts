import { test, expect } from "@playwright/test";

const baseUrl = "https://teskerti.tn/";

test.describe("SCRUM-2 - Consultation du programme mis en avant", () => {
  // Teskerti homepage date format is French text, e.g. "06 Septembre 2026 à 22:00".
  test("Les cartes d'événements affichent salle, nom et date (et un lien évènement)", async ({ page }) => {
    await page.goto(baseUrl);

    const card = page.locator("div.owl-item.active div.tour_container").first();
    await expect(card).toBeVisible();
    await expect(card.locator('a[href*="/evenement/"]')).toBeVisible();
    await expect(card).toContainText(/\d{1,2}\s+?[A-Za-zÀ-ÿ]+\s+\d{4}\s+?à\s+?\d{1,2}:\d{2}/);
  });

  test("Le bouton « Réservez vos billets » est présent dans la section héro", async ({ page }) => {
    await page.goto(baseUrl);
    const button = page.getByRole("link", { name: "Réservez vos billets" }).first();
    await button.waitFor({ state: "visible" });
    await expect(button).toBeVisible();
  });

  test("Navigation depuis la héro vers la fiche d'un événement en vedette", async ({ page }) => {
    await page.goto(baseUrl);
    const button = page.getByRole("link", { name: "Réservez vos billets" }).first();
    await button.waitFor({ state: "visible" });
    await button.click();
    await expect(page).toHaveURL(/\/evenement\//);
  });

  test("Navigation vers la page contact via le lien pied de page", async ({ page }) => {
    await page.goto(baseUrl);
    const footerContact = page
      .locator("footer, .footer, [class*='footer']")
      .getByRole("link", { name: "Contactez nous" })
      .first();
    await footerContact.waitFor({ state: "visible" });
    await footerContact.click();
    await expect(page).toHaveURL(/\/contact/);
  });

  test("Navigation vers la catégorie Spectacle depuis la navigation principale", async ({ page }) => {
    await page.goto(baseUrl);
    const categoryLink = page.locator('a[href*="/category/spectacle"]').first();
    await categoryLink.waitFor({ state: "visible" });
    await categoryLink.click();
    await expect(page).toHaveURL(/\/category\/spectacle/);
  });
});