import { expect, test } from "@playwright/test";
import {
  expectFormValues,
  expectLatestSubmission,
  extractButton,
  fillValidReceiptForm,
  gotoHome,
  mockExtractionResponse,
  runMockedExtraction,
  submitButton,
  uploadReceipt
} from "./support/receipt";

test.describe("receipt persistence and reset", () => {
  test("saves the reviewed receipt JSON to localStorage", async ({ page }) => {
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

  test("reset clears preview, form values, extraction notes, errors, and submitted output", async ({ page }) => {
    await runMockedExtraction(page);
    await submitButton(page).click();
    await expect(page.getByText(/receipt data submitted successfully/i)).toBeVisible();

    await page.getByRole("button", { name: /reset/i }).click();

    await expect(page.getByText("sample-receipt.png")).toBeHidden();
    await expect(page.getByRole("img", { name: "Receipt preview" })).toBeHidden();
    await expect(page.getByText(/high confidence/i)).toBeHidden();
    await expect(page.getByText(/clear receipt image/i)).toBeHidden();
    await expect(page.getByText(/receipt data submitted successfully/i)).toBeHidden();
    await expectFormValues(page, {
      merchantName: "",
      date: "",
      totalAmount: "",
      currency: "",
      notes: ""
    });
    await expect(extractButton(page)).toBeDisabled();
  });

  test("reset clears extraction errors", async ({ page }) => {
    await mockExtractionResponse(page, undefined, {
      status: 500,
      body: { error: "Missing GEMINI_API_KEY." }
    });

    await gotoHome(page);
    await uploadReceipt(page);
    await extractButton(page).click();
    await expect(page.getByText("Missing GEMINI_API_KEY.")).toBeVisible();

    await page.getByRole("button", { name: /reset/i }).click();

    await expect(page.getByText("Missing GEMINI_API_KEY.")).toBeHidden();
    await expect(extractButton(page)).toBeDisabled();
  });
});
