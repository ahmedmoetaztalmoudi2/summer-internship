import { test, expect } from "@playwright/test";

   test.describe("Navigation et contenu du pied de page", () => {
     test("Vérification de la liste des catégories et du lien \"La liste de nos guichets\" dans le footer - catégories", async ({ page }) => {
       await page.goto("https://teskerti.tn");
       // TODO: l'utilisateur consulte le pied de page
       await page.locator("footer").scrollIntoViewIfNeeded();
       // TODO: selector for category list not provided in knownSelectors
       await expect(page.locator("footer ul, footer .categories")).toBeVisible();
     });

     test("Vérification de la liste des catégories et du lien \"La liste de nos guichets\" dans le footer - lien guichets", async ({ page }) => {
       await page.goto("https://teskerti.tn");
       // TODO: l'utilisateur consulte le pied de page
       await page.locator("footer").scrollIntoViewIfNeeded();
       await expect(page.getByRole("link", { name: "La liste de nos guichets" })).toBeVisible();
     });
   });
