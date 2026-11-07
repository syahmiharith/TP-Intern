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
      "AI-assisted receipt extraction with editable human review and reviewed expense CSV export."
    );
    await expect(page.locator("main")).toBeVisible();
    await uploadReceipt(page);
    await extractButton(page, /Extract 1 file/i).click();

    await expect(page.getByText(/FamilyMart · KRW 12000.00 · 2026-05-11/i)).toBeVisible();
    await page.getByRole("button", { name: "Mark reviewed", exact: true }).click();
    await expect(page.getByRole("button", { name: "Export expenses CSV (1)" })).toBeVisible();

    await expandCurrentReceipt(page);
    await page.getByText("Extracted items (1)", {exact:true}).click();
    await expect(page.getByText("Coffee")).toBeVisible();
  });
});
