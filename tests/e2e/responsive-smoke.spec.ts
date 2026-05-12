import { expect, test } from "@playwright/test";
import {
  expectLatestSubmission,
  currencyInput,
  extractButton,
  gotoHome,
  highConfidenceExtraction,
  merchantNameInput,
  mockExtractionResponse,
  submitButton,
  typeTextInput,
  uploadReceipt
} from "./support/receipt";

test.describe("responsive receipt flow smoke", () => {
  test("core upload, extraction, review, and submit flow works in configured viewports", async ({ page }) => {
    await mockExtractionResponse(page, highConfidenceExtraction);
    await gotoHome(page);

    await expect(page.locator("main")).toBeVisible();
    await uploadReceipt(page);
    await extractButton(page).click();
    await expect(merchantNameInput(page)).toHaveValue("FamilyMart");

    await typeTextInput(currencyInput(page), "myr");
    await submitButton(page).click();

    await expectLatestSubmission(page, {
      merchantName: "FamilyMart",
      date: "2026-05-11",
      totalAmount: "12000",
      currency: "MYR",
      notes: "Clear receipt image."
    });
  });
});
