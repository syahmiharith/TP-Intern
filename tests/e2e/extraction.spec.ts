import { expect, test } from "@playwright/test";
import {
  Confidence,
  expectFormValues,
  extractButton,
  gotoHome,
  highConfidenceExtraction,
  merchantNameInput,
  lowConfidenceExtraction,
  mediumConfidenceExtraction,
  mockExtractionResponse,
  uploadReceipt
} from "./support/receipt";

const extractionCases: Array<{
  confidence: Confidence;
  note: RegExp;
  values: {
    merchantName: string;
    date: string;
    totalAmount: string;
    currency: string;
    notes: string;
  };
}> = [
  {
    confidence: "high",
    note: /clear receipt image/i,
    values: {
      merchantName: "FamilyMart",
      date: "2026-05-11",
      totalAmount: "12000",
      currency: "KRW",
      notes: "Clear receipt image."
    }
  },
  {
    confidence: "medium",
    note: /currency inferred/i,
    values: {
      merchantName: "Tealive",
      date: "2026-05-10",
      totalAmount: "8.9",
      currency: "MYR",
      notes: "Currency inferred from receipt symbol."
    }
  },
  {
    confidence: "low",
    note: /receipt is blurry/i,
    values: {
      merchantName: "",
      date: "",
      totalAmount: "",
      currency: "",
      notes: "Receipt is blurry. Please verify all fields."
    }
  }
];

test.describe("receipt extraction behavior", () => {
  test("posts multipart form data once and shows a loading state", async ({ page }) => {
    const calls = await mockExtractionResponse(page, highConfidenceExtraction, { delayMs: 250 });

    await gotoHome(page);
    await uploadReceipt(page);

    await extractButton(page).click();
    await expect(extractButton(page)).toBeDisabled();
    await expect(extractButton(page)).toContainText(/extracting receipt data/i);
    await expect(merchantNameInput(page)).toHaveValue("FamilyMart");

    expect(calls).toHaveLength(1);
    expect(calls[0].method()).toBe("POST");
    expect(calls[0].headers()["content-type"]).toContain("multipart/form-data");
  });

  for (const { confidence, note, values } of extractionCases) {
    test(`auto-fills review form for ${confidence}-confidence extraction`, async ({ page }) => {
      const extraction =
        confidence === "high"
          ? highConfidenceExtraction
          : confidence === "medium"
            ? mediumConfidenceExtraction
            : lowConfidenceExtraction;

      await mockExtractionResponse(page, extraction);
      await gotoHome(page);
      await uploadReceipt(page);
      await extractButton(page).click();

      await expect(page.getByText(new RegExp(`${confidence} confidence`, "i"))).toBeVisible();
      await expect(page.locator("li").filter({ hasText: note })).toBeVisible();
      await expectFormValues(page, values);
    });
  }

  for (const { status, message } of [
    { status: 400, message: "Only image receipts are supported in this MVP." },
    { status: 429, message: "Rate limit exceeded" },
    { status: 500, message: "Missing GEMINI_API_KEY." }
  ]) {
    test(`shows API ${status} errors without crashing`, async ({ page }) => {
      await mockExtractionResponse(page, highConfidenceExtraction, {
        status,
        body: { error: message }
      });

      await gotoHome(page);
      await uploadReceipt(page);
      await extractButton(page).click();

      await expect(page.getByText(message)).toBeVisible();
      await expect(page.getByRole("heading", { name: /review auto-filled form/i })).toBeVisible();
      await expectFormValues(page, {
        merchantName: "",
        date: "",
        totalAmount: "",
        currency: ""
      });
    });
  }

  test("handles successful responses with missing data as extraction failures", async ({ page }) => {
    await mockExtractionResponse(page, highConfidenceExtraction, { body: {} });

    await gotoHome(page);
    await uploadReceipt(page);
    await extractButton(page).click();

    await expect(page.getByText("Receipt extraction failed.")).toBeVisible();
    await expect(extractButton(page)).toBeEnabled();
  });

  test("handles null data responses as extraction failures", async ({ page }) => {
    await mockExtractionResponse(page, highConfidenceExtraction, { body: { data: null } });

    await gotoHome(page);
    await uploadReceipt(page);
    await extractButton(page).click();

    await expect(page.getByText("Receipt extraction failed.")).toBeVisible();
    await expect(extractButton(page)).toBeEnabled();
  });
});
