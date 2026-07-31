import { test, expect } from "@playwright/test";

test.describe("User login", () => {
  test("Successful login", async ({ page }) => {
    // Given the user is on the login page
    await page.goto("https://teskerti.tn/user/login");

    // When the user enters a valid email and password
    await page.getByPlaceholder("Email").fill("mellitisabaa@gmail.com");
    await page.getByPlaceholder("Mot de passe").fill("123456789");

    // And clicks on "Se connecter"
    await page.getByRole('button', { name: 'Se connecter' }).click();

    // Then the user should be logged in
    await expect(page).not.toHaveURL("https://teskerti.tn/user/login");
  });
});
