import { expect, test } from "@playwright/test";
import {
  expandCurrentReceipt,
  extractButton,
  gotoHome,
  highConfidenceExtraction,
  mockExtractionResponse,
  uploadReceipt
} from "./support/receipt";

test.describe("responsive receipt queue smoke", () => {
  test("core upload, extraction, review, and download visibility works in configured viewports", async ({ page }) => {
    await mockExtractionResponse(page, highConfidenceExtraction);
    await gotoHome(page);

    await expect(page.locator("main")).toBeVisible();
    await uploadReceipt(page);
    await extractButton(page, /Extract 1 file/i).click();

    await expect(page.getByText(/FamilyMart · KRW 12000.00 · 2026-05-11/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Download result for sample-receipt.png/i })).toBeVisible();

    await expandCurrentReceipt(page);
    await expect(page.getByText("Extracted Items")).toBeVisible();
    await expect(page.getByText("Coffee")).toBeVisible();
  });
});
