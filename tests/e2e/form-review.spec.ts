import { expect, test } from "@playwright/test";
import {
  currencyInput,
  dateInput,
  expectFormValues,
  expectLatestSubmission,
  fillValidReceiptForm,
  gotoHome,
  merchantNameInput,
  notesInput,
  runMockedExtraction,
  submitButton,
  totalAmountInput,
  typeTextInput
} from "./support/receipt";

test.describe("receipt form review and validation", () => {
  test("allows manual edits and normalizes submitted currency", async ({ page }) => {
    await runMockedExtraction(page);

    await typeTextInput(merchantNameInput(page), "Manual Cafe");
    await totalAmountInput(page).fill("15.50");
    await typeTextInput(currencyInput(page), "myr");
    await typeTextInput(notesInput(page), "Corrected manually.");
    await submitButton(page).click();

    await expectLatestSubmission(page, {
      merchantName: "Manual Cafe",
      date: "2026-05-11",
      totalAmount: "15.50",
      currency: "MYR",
      notes: "Corrected manually."
    });
  });

  test("blocks incomplete submissions and identifies missing required fields", async ({ page }) => {
    await gotoHome(page);

    await typeTextInput(merchantNameInput(page), "Only Merchant");
    await submitButton(page).click();

    await expect(page.getByText("Date is required.")).toBeVisible();
    await expect(page.getByText("Total amount must be a number greater than 0.")).toBeVisible();
    await expect(page.getByText("Currency is required.")).toBeVisible();
    await expect(page.getByText(/submission saved locally/i)).toBeHidden();
  });

  test("clears validation errors as fields are corrected", async ({ page }) => {
    await gotoHome(page);

    await typeTextInput(merchantNameInput(page), "Only Merchant");
    await submitButton(page).click();
    await expect(page.getByText("Date is required.")).toBeVisible();

    await dateInput(page).fill("2026-05-11");
    await totalAmountInput(page).fill("10.90");
    await typeTextInput(currencyInput(page), "MYR");

    await expect(page.getByText("Date is required.")).toBeHidden();
    await expect(page.getByText("Total amount must be a number greater than 0.")).toBeHidden();
    await expect(page.getByText("Currency is required.")).toBeHidden();
  });

  test("rejects invalid amount and currency before accepting corrected values", async ({ page }) => {
    await gotoHome(page);

    await typeTextInput(merchantNameInput(page), "Manual Merchant");
    await dateInput(page).fill("2026-05-11");
    await totalAmountInput(page).fill("-1");
    await typeTextInput(currencyInput(page), "US");
    await submitButton(page).click();

    await expect(page.getByText("Total amount must be a number greater than 0.")).toBeVisible();
    await expect(page.getByText(/use a 3-letter currency code/i)).toBeVisible();

    await totalAmountInput(page).fill("10.90");
    await typeTextInput(currencyInput(page), "usd");
    await typeTextInput(notesInput(page), "");
    await submitButton(page).click();

    await expectLatestSubmission(page, {
      merchantName: "Manual Merchant",
      date: "2026-05-11",
      totalAmount: "10.90",
      currency: "USD",
      notes: ""
    });
  });

  test("keeps extracted notes editable before submit", async ({ page }) => {
    await runMockedExtraction(page);

    await expectFormValues(page, { notes: "Clear receipt image." });
    await typeTextInput(notesInput(page), "Reviewer replaced the AI note.");
    await submitButton(page).click();

    await expect(page.locator("pre")).toContainText("Reviewer replaced the AI note.");
  });

  test("supports fully manual entry without running extraction", async ({ page }) => {
    await gotoHome(page);
    await fillValidReceiptForm(page);
    await submitButton(page).click();

    await expectLatestSubmission(page, {
      merchantName: "Manual Cafe",
      date: "2026-05-11",
      totalAmount: "15.50",
      currency: "MYR",
      notes: "Corrected manually."
    });
  });
});
