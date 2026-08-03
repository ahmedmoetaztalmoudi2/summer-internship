import { test, expect } from "@playwright/test";

test.describe("User login", () => {
  test("Successful login", async ({ page }) => {
    // Given the user is on the login page at "https://teskerti.tn/user/login"
    await page.goto("https://teskerti.tn/user/login");

    // When the user enters email in input with placeholder "Email" and password in input with placeholder "Mot de passe"
    // TODO: Verify test credentials or replace with valid test data
    await page.getByPlaceholder("Email").fill("mellitisabaa@gmail.com");
    await page.getByPlaceholder("Mot de passe").fill("123456789");

    // And clicks on button with text "Se connecter"
    await page.getByRole("button", { name: "Se connecter" }).click();

    // Debug: Wait and check for error messages
    await page.waitForTimeout(3000);
    console.log('Current URL after login:', page.url());
    
    // Check if there's an error message on the page
    const errorElement = page.locator('.alert, .error, .danger, [class*="error"], [class*="alert"]').first();
    if (await errorElement.isVisible()) {
      const errorText = await errorElement.textContent();
      console.log('Error message found:', errorText);
    }

    // Then the user should be redirected to "https://teskerti.tn/client/home"
    await expect(page).toHaveURL("https://teskerti.tn/client/home");
  });
});
