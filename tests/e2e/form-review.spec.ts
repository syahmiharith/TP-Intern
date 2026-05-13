import { expect, test } from "@playwright/test";
import {
  currencyInput,
  dateInput,
  expandCurrentReceipt,
  extractButton,
  fillReviewFields,
  gotoHome,
  lowConfidenceExtraction,
  merchantNameInput,
  mockExtractionResponse,
  receiptTypeInput,
  saveChanges,
  totalAmountInput,
  typeTextInput,
  uploadReceipt
} from "./support/receipt";

test.describe("receipt review and validation", () => {
  test("requires manual fixes for needs-review results before download", async ({ page }) => {
    await mockExtractionResponse(page, lowConfidenceExtraction);
    await gotoHome(page);
    await uploadReceipt(page);
    await extractButton(page, /Extract 1 file/i).click();

    await expect(page.getByText(/Needs review/i)).toBeVisible();
    await expandCurrentReceipt(page);
    await expect(page.getByText("Merchant name is required.")).toBeVisible();

    await fillReviewFields(page);
    await saveChanges(page);

    await expect(page.getByText(/Edited/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Download result for sample-receipt.png/i })).toBeVisible();
  });

  test("keeps validation errors until corrected", async ({ page }) => {
    await mockExtractionResponse(page, lowConfidenceExtraction);
    await gotoHome(page);
    await uploadReceipt(page);
    await extractButton(page, /Extract 1 file/i).click();
    await expandCurrentReceipt(page);

    await saveChanges(page);
    await expect(page.getByText("Merchant name is required.")).toBeVisible();
    await expect(page.getByText("Date is required.")).toBeVisible();
    await expect(page.getByText("Total amount must be a number greater than 0.")).toBeVisible();

    await typeTextInput(merchantNameInput(page), "Manual Cafe");
    await dateInput(page).fill("2026-05-11");
    await totalAmountInput(page).fill("15.50");
    await typeTextInput(currencyInput(page), "MYR");
    await receiptTypeInput(page).selectOption("Food & Beverage");
    await saveChanges(page);

    await expect(page.getByText("Merchant name is required.")).toBeHidden();
    await expect(page.getByText(/Edited/i)).toBeVisible();
  });

  test("rejects invalid amount and currency before accepting corrected values", async ({ page }) => {
    await mockExtractionResponse(page, lowConfidenceExtraction);
    await gotoHome(page);
    await uploadReceipt(page);
    await extractButton(page, /Extract 1 file/i).click();
    await expandCurrentReceipt(page);

    await typeTextInput(merchantNameInput(page), "Manual Merchant");
    await dateInput(page).fill("2026-05-11");
    await totalAmountInput(page).fill("-1");
    await typeTextInput(currencyInput(page), "US");
    await saveChanges(page);

    await expect(page.getByText("Total amount must be a number greater than 0.")).toBeVisible();
    await expect(page.getByText(/Use a 3-letter currency code/i)).toBeVisible();

    await totalAmountInput(page).fill("10.90");
    await typeTextInput(currencyInput(page), "USD");
    await saveChanges(page);

    await expect(page.getByText(/Edited/i)).toBeVisible();
  });
});
