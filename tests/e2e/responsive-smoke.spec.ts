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
      "Turn receipt images into editable expenses and line items, saved as you type and ready for CSV export."
    );
    await expect(page.locator("main")).toBeVisible();
    await uploadReceipt(page);
    await extractButton(page, /Extract 1 file/i).click();

    await expect(page.locator("article").getByText("Ready",{exact:true})).toBeVisible();
    await expect(page.getByRole("button", { name: "Export expenses CSV (1)" })).toBeVisible();

    await expandCurrentReceipt(page);
    await expect(page.getByRole("table", { name: "Extracted items" })).toBeVisible();
    await expect(page.getByLabel("Item 1 name",{exact:true})).toHaveValue("Coffee");
  });
});
