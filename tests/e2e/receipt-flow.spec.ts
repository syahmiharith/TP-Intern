import { expect, test } from "@playwright/test";

const receiptFile = {
  name: "sample-receipt.png",
  mimeType: "image/png",
  buffer: Buffer.from("fake image content")
};

test.describe("receipt-to-form flow", () => {
  test("happy path: upload, extract, edit, submit", async ({ page }) => {
    await page.route("**/api/extract-receipt", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            merchantName: "FamilyMart",
            date: "2026-05-11",
            totalAmount: 12000,
            currency: "KRW",
            confidence: "high",
            notes: ["Clear receipt image."]
          }
        })
      });
    });

    await page.goto("/");

    await page.locator('input[type="file"]').setInputFiles(receiptFile);
    await expect(page.getByText("sample-receipt.png")).toBeVisible();

    await page.getByRole("button", { name: /extract data with ai/i }).click();

    await expect(page.getByLabel(/merchant name/i)).toHaveValue("FamilyMart");
    await expect(page.getByLabel(/date/i)).toHaveValue("2026-05-11");
    await expect(page.getByLabel(/total amount/i)).toHaveValue("12000");
    await expect(page.getByLabel(/currency/i)).toHaveValue("KRW");
    await expect(page.getByText(/high confidence/i)).toBeVisible();

    await page.getByLabel(/currency/i).fill("MYR");
    await page.getByLabel(/notes/i).fill("Reviewer corrected currency for demo.");

    await page.getByRole("button", { name: /submit extracted data/i }).click();

    await expect(page.getByText(/submission saved locally/i)).toBeVisible();
    await expect(page.locator("pre")).toContainText("FamilyMart");
    await expect(page.locator("pre")).toContainText("MYR");
  });

  test("shows API failure without crashing", async ({ page }) => {
    await page.route("**/api/extract-receipt", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Missing GEMINI_API_KEY." })
      });
    });

    await page.goto("/");
    await page.locator('input[type="file"]').setInputFiles(receiptFile);
    await page.getByRole("button", { name: /extract data with ai/i }).click();

    await expect(page.getByText("Missing GEMINI_API_KEY.")).toBeVisible();
    await expect(page.getByRole("heading", { name: /review auto-filled form/i })).toBeVisible();
  });

  test("low-confidence extraction can be corrected manually", async ({ page }) => {
    await page.route("**/api/extract-receipt", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            merchantName: null,
            date: null,
            totalAmount: null,
            currency: null,
            confidence: "low",
            notes: ["Receipt is blurry. Please verify all fields."]
          }
        })
      });
    });

    await page.goto("/");
    await page.locator('input[type="file"]').setInputFiles(receiptFile);
    await page.getByRole("button", { name: /extract data with ai/i }).click();

    await expect(page.getByText(/low confidence/i)).toBeVisible();
    await expect(page.getByText(/receipt is blurry/i)).toBeVisible();

    await page.getByLabel(/merchant name/i).fill("Manual Merchant");
    await page.getByLabel(/date/i).fill("2026-05-11");
    await page.getByLabel(/total amount/i).fill("10.90");
    await page.getByLabel(/currency/i).fill("MYR");

    await page.getByRole("button", { name: /submit extracted data/i }).click();

    await expect(page.getByText(/submission saved locally/i)).toBeVisible();
    await expect(page.locator("pre")).toContainText("Manual Merchant");
  });

  test("validates required form fields", async ({ page }) => {
    await page.goto("/");

    await page.getByLabel(/merchant name/i).fill("Only Merchant");
    await page.getByRole("button", { name: /submit extracted data/i }).click();

    await expect(page.getByText("Date is required.")).toBeVisible();
    await expect(page.getByText("Total amount must be a number greater than 0.")).toBeVisible();
    await expect(page.getByText("Currency is required.")).toBeVisible();
  });
});
