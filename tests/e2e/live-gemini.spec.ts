import { expect, test } from "@playwright/test";
import {
  createGeneratedReceiptPng,
  extractButton,
  expandCurrentReceipt,
  gotoHome,
  uploadReceipt
} from "./support/receipt";

test.describe("live-gemini receipt extraction", () => {
  test("extracts usable required fields from a generated receipt image", async ({ page }) => {
    test.skip(process.env.RUN_LIVE_GEMINI_E2E !== "1", "Run npm run test:e2e:live to enable live Gemini E2E.");
    test.skip(!process.env.GEMINI_API_KEY, "GEMINI_API_KEY was not found in the loaded environment.");

    await gotoHome(page);
    await uploadReceipt(page, await createGeneratedReceiptPng(page));
    await extractButton(page, /Extract 1 file/i).click();

    const extractionError = page
      .locator("main")
      .getByText(/missing gemini|gemini .*failed|rate limit|overloaded|unavailable|error|high demand|try again later/i);
    if ((await extractionError.count()) > 0) {
      throw new Error(`Live Gemini extraction failed: ${await extractionError.first().textContent()}`);
    }

    await expect(page.getByText(/Extracted|Needs review/i)).toBeVisible({ timeout: 60_000 });
    await expandCurrentReceipt(page, "live-gemini-receipt.png");
    const amount = Number(await page.getByLabel("Total Amount").inputValue());
    expect(amount).toBeGreaterThan(0);
  });
});
