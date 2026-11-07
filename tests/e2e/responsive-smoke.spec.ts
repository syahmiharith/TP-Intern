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

    await expect(page).toHaveTitle("Receipt-to-Form");
    await expect(page.getByText("Receipt-to-Form", { exact: true })).toBeVisible();
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      "Turn receipts into expenses you can review, correct, and export to your spreadsheet."
    );
    await expect(page.locator("main")).toBeVisible();
    await uploadReceipt(page);
    await extractButton(page, /Extract 1 file/i).click();

    await expect(page.getByText(/FamilyMart · KRW 12000 · 2026-05-11/i)).toBeVisible();
    await page.getByRole("button", { name: "Mark reviewed", exact: true }).click();
    await expect(page.getByRole("button", { name: "Export expenses CSV (1)" })).toBeVisible();

    await expandCurrentReceipt(page);
    await expect(page.getByRole("table", { name: "Extracted items" })).toBeVisible();
    await expect(page.getByText("Coffee")).toBeVisible();
  });
});
