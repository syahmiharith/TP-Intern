import { expect, test } from "@playwright/test";
import {
  createGeneratedReceiptPng,
  currencyInput,
  dateInput,
  extractButton,
  gotoHome,
  merchantNameInput,
  totalAmountInput,
  uploadReceipt
} from "./support/receipt";

test.describe("live-gemini receipt extraction", () => {
  test("extracts usable required fields from a generated receipt image", async ({ page }) => {
    test.skip(process.env.RUN_LIVE_GEMINI_E2E !== "1", "Run npm run test:e2e:live to enable live Gemini E2E.");
    test.skip(!process.env.GEMINI_API_KEY, "GEMINI_API_KEY was not found in the loaded environment.");

    await gotoHome(page);
    await uploadReceipt(page, await createGeneratedReceiptPng(page));
    await extractButton(page).click();
    await expect(extractButton(page)).toBeEnabled({ timeout: 60_000 });

    const extractionError = page
      .locator("main")
      .getByText(/missing gemini|gemini .*failed|rate limit|overloaded|unavailable|error|high demand|try again later/i);
    if ((await extractionError.count()) > 0) {
      throw new Error(`Live Gemini extraction failed: ${await extractionError.first().textContent()}`);
    }

    await expect(page.getByText(/submission saved locally/i)).toBeHidden();
    await expect(page.getByRole("heading", { name: /review auto-filled form/i })).toBeVisible();
    await expect(merchantNameInput(page)).not.toHaveValue("", { timeout: 45_000 });
    await expect(dateInput(page)).not.toHaveValue("");
    await expect(totalAmountInput(page)).not.toHaveValue("");
    await expect(currencyInput(page)).toHaveValue(/^[A-Za-z]{3}$/);

    const amount = Number(await totalAmountInput(page).inputValue());
    expect(amount).toBeGreaterThan(0);
  });
});
