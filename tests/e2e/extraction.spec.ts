import { expect, test } from "@playwright/test";
import {
  defaultReceiptFile,
  expandCurrentReceipt,
  extractButton,
  gotoHome,
  highConfidenceExtraction,
  lowConfidenceExtraction,
  mediumConfidenceExtraction,
  mockExtractionResponse,
  uploadReceipt
} from "./support/receipt";

test.describe("receipt extraction queue behavior", () => {
  test("posts multipart form data once and shows extracting row state", async ({ page }) => {
    const calls = await mockExtractionResponse(page, highConfidenceExtraction, { delayMs: 1000 });

    await gotoHome(page);
    await uploadReceipt(page);

    await extractButton(page, /Extract 1 file/i).click();
    await expect(page.getByText(/Reading receipt fields/i)).toBeVisible();
    await expect(page.getByText(/Extracting/i)).toBeVisible();
    await expect(page.getByText(/FamilyMart · KRW 12000.00 · 2026-05-11/i)).toBeVisible();

    expect(calls).toHaveLength(1);
    expect(calls[0].method()).toBe("POST");
    expect(calls[0].headers()["content-type"]).toContain("multipart/form-data");
  });

  for (const { name, extraction, summary } of [
    {
      name: "high-confidence extraction",
      extraction: highConfidenceExtraction,
      summary: /FamilyMart · KRW 12000.00 · 2026-05-11/i
    },
    {
      name: "medium-confidence extraction",
      extraction: mediumConfidenceExtraction,
      summary: /Tealive · MYR 8.90 · 2026-05-10/i
    }
  ]) {
    test(`marks ${name} as complete and downloadable`, async ({ page }) => {
      await mockExtractionResponse(page, extraction);
      await gotoHome(page);
      await uploadReceipt(page);
      await extractButton(page, /Extract 1 file/i).click();

      await expect(page.getByText(summary)).toBeVisible();
      await expect(page.getByRole("button", { name: /Download result for sample-receipt.png/i })).toBeVisible();
    });
  }

  test("marks low-confidence partial extraction as needs review", async ({ page }) => {
    await mockExtractionResponse(page, lowConfidenceExtraction);
    await gotoHome(page);
    await uploadReceipt(page);
    await extractButton(page, /Extract 1 file/i).click();

    await expect(page.getByText(/Needs review/i)).toBeVisible();
    await expect(page.getByText(/Unknown merchant · MYR — · —/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Download result/i })).toBeHidden();

    await expandCurrentReceipt(page);
    await expect(page.getByText("Merchant name is required.")).toBeVisible();
    await expect(page.getByText("Date is required.")).toBeVisible();
  });

  for (const { status, message } of [
    { status: 400, message: "Only image receipts are supported in this MVP." },
    { status: 429, message: "Rate limit exceeded" },
    { status: 500, message: "Missing GEMINI_API_KEY." }
  ]) {
    test(`shows API ${status} failure as retryable failed row`, async ({ page }) => {
      await mockExtractionResponse(page, highConfidenceExtraction, {
        status,
        body: { error: message }
      });

      await gotoHome(page);
      await uploadReceipt(page);
      await extractButton(page, /Extract 1 file/i).click();

      await expect(page.getByText(/Failed/i)).toBeVisible();
      await expect(page.getByText(message)).toBeVisible();
      await expect(page.getByRole("button", { name: /Extract 1 file/i })).toBeVisible();
    });
  }

  test("extract selected skips already processed rows and processes ready rows", async ({ page }) => {
    const calls = await mockExtractionResponse(page, highConfidenceExtraction);
    await gotoHome(page);
    await page.locator('input[type="file"]').first().setInputFiles([
      defaultReceiptFile,
      { name: "second-receipt.png", mimeType: "image/png", buffer: Buffer.from("second") }
    ]);

    await page.getByRole("button", { name: /Deselect second-receipt.png/i }).click();
    await extractButton(page, /Extract 1 file/i).click();
    await expect(page.getByText(/FamilyMart · KRW 12000.00 · 2026-05-11/i)).toBeVisible();

    await page.getByRole("button", { name: /Select second-receipt.png/i }).click();
    await extractButton(page, /Extract 1 file/i).click();

    expect(calls).toHaveLength(2);
  });
});
