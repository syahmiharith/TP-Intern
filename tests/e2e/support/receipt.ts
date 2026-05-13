import { expect, Locator, Page, Request } from "@playwright/test";

export type Confidence = "high" | "medium" | "low";

export type MockExtraction = {
  merchantName: string | null;
  receiptType:
    | "Food & Beverage"
    | "Groceries"
    | "Retail"
    | "Transport"
    | "Utilities"
    | "Medical"
    | "Accommodation"
    | "Entertainment"
    | "Other"
    | null;
  date: string | null;
  totalAmount: number | null;
  currency: string | null;
  confidence: Confidence;
  notes: string[];
  items: Array<{ name: string; quantity: number | null; value: number | null }>;
};

type MockRouteOptions = {
  status?: number;
  body?: unknown;
  delayMs?: number;
  contentType?: string;
};

export const defaultReceiptFile = {
  name: "sample-receipt.png",
  mimeType: "image/png",
  buffer: Buffer.from("fake image content")
};

export const acceptedReceiptFiles = [
  defaultReceiptFile,
  {
    name: "sample-receipt.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from("fake jpeg image content")
  },
  {
    name: "sample-receipt.webp",
    mimeType: "image/webp",
    buffer: Buffer.from("fake webp image content")
  }
];

export const highConfidenceExtraction: MockExtraction = {
  merchantName: "FamilyMart",
  receiptType: "Food & Beverage",
  date: "2026-05-11",
  totalAmount: 12000,
  currency: "KRW",
  confidence: "high",
  notes: ["Clear receipt image."],
  items: [{ name: "Coffee", quantity: 1, value: 12000 }]
};

export const mediumConfidenceExtraction: MockExtraction = {
  merchantName: "Tealive",
  receiptType: "Food & Beverage",
  date: "2026-05-10",
  totalAmount: 8.9,
  currency: "MYR",
  confidence: "medium",
  notes: ["Currency inferred from receipt symbol."],
  items: [{ name: "Milk Tea", quantity: 1, value: 8.9 }]
};

export const lowConfidenceExtraction: MockExtraction = {
  merchantName: null,
  receiptType: "Retail",
  date: null,
  totalAmount: null,
  currency: "MYR",
  confidence: "low",
  notes: ["Receipt is blurry. Please verify all fields."],
  items: [{ name: "Item text unclear", quantity: null, value: null }]
};

export function extractButton(page: Page, name = /extract/i) {
  return page.getByRole("button", { name });
}

export function expandButton(page: Page, fileName = defaultReceiptFile.name) {
  return page.getByRole("button", { name: new RegExp(`Expand ${fileName}`, "i") });
}

export function merchantNameInput(page: Page) {
  return page.getByLabel("Merchant Name");
}

export function dateInput(page: Page) {
  return page.getByLabel("Date");
}

export function totalAmountInput(page: Page) {
  return page.getByLabel("Total Amount");
}

export function currencyInput(page: Page) {
  return page.getByLabel("Currency");
}

export function receiptTypeInput(page: Page) {
  return page.getByLabel("Receipt Type");
}

export async function typeTextInput(locator: Locator, value: string) {
  await locator.fill(value);
  await expect(locator).toHaveValue(value);
}

export async function gotoHome(page: Page) {
  await page.goto("/");
  await expect(page.getByText("Upload receipt files")).toBeVisible();
}

export async function uploadReceipt(page: Page, file = defaultReceiptFile) {
  await page.locator('input[type="file"]').first().setInputFiles(file);

  if (["image/jpeg", "image/png", "image/webp"].includes(file.mimeType) && file.buffer.length <= 5 * 1024 * 1024) {
    await expect(page.getByText(file.name)).toBeVisible();
  }
}

export async function uploadReceipts(page: Page, files = [defaultReceiptFile]) {
  await page.locator('input[type="file"]').first().setInputFiles(files);
  for (const file of files) {
    await expect(page.getByText(file.name)).toBeVisible();
  }
}

export async function expectReceiptQueued(page: Page, fileName: string) {
  await expect(page.getByText(fileName)).toBeVisible();
  await expect(page.getByText(/Waiting for extraction/i)).toBeVisible();
}

export async function mockExtractionResponse(
  page: Page,
  extraction: MockExtraction = highConfidenceExtraction,
  options: MockRouteOptions = {}
) {
  const calls: Request[] = [];

  await page.route("**/api/extract-receipt", async (route) => {
    calls.push(route.request());

    if (options.delayMs) {
      await new Promise((resolve) => {
        setTimeout(resolve, options.delayMs);
      });
    }

    const status = options.status ?? 200;
    const body = options.body ?? { data: extraction };

    await route.fulfill({
      status,
      contentType: options.contentType ?? "application/json",
      body: typeof body === "string" ? body : JSON.stringify(body)
    });
  });

  return calls;
}

export async function runMockedExtraction(page: Page, extraction = highConfidenceExtraction) {
  await mockExtractionResponse(page, extraction);
  await gotoHome(page);
  await uploadReceipt(page);
  await extractButton(page, /Extract 1 file/i).click();
}

export async function expandCurrentReceipt(page: Page, fileName = defaultReceiptFile.name) {
  await expandButton(page, fileName).click();
  await expect(page.getByText(/Receipt Details|Review Required/i)).toBeVisible();
}

export async function expectFormValues(
  page: Page,
  values: {
    merchantName?: string;
    date?: string;
    totalAmount?: string;
    currency?: string;
    receiptType?: string;
  }
) {
  if (values.merchantName !== undefined) await expect(merchantNameInput(page)).toHaveValue(values.merchantName);
  if (values.date !== undefined) await expect(dateInput(page)).toHaveValue(values.date);
  if (values.totalAmount !== undefined) await expect(totalAmountInput(page)).toHaveValue(values.totalAmount);
  if (values.currency !== undefined) await expect(currencyInput(page)).toHaveValue(values.currency);
  if (values.receiptType !== undefined) await expect(receiptTypeInput(page)).toHaveValue(values.receiptType);
}

export async function fillReviewFields(page: Page) {
  await typeTextInput(merchantNameInput(page), "Manual Cafe");
  await receiptTypeInput(page).selectOption("Food & Beverage");
  await dateInput(page).fill("2026-05-11");
  await totalAmountInput(page).fill("15.50");
  await typeTextInput(currencyInput(page), "MYR");
}

export async function saveChanges(page: Page) {
  await page.getByRole("button", { name: /Save changes/i }).click();
}

export async function createGeneratedReceiptPng(page: Page) {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 1100;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("Unable to create receipt image.");

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#111827";
    context.textBaseline = "top";
    context.font = "700 44px Arial, sans-serif";
    context.fillText("TP INTERN TEST MART", 80, 80);
    context.font = "28px Arial, sans-serif";
    context.fillText("Date: 2026-05-11", 80, 245);
    context.fillText("Coffee", 80, 420);
    context.fillText("8.50", 650, 420);
    context.fillText("Sandwich", 80, 480);
    context.fillText("12.40", 650, 480);
    context.font = "700 42px Arial, sans-serif";
    context.fillText("TOTAL MYR", 80, 660);
    context.fillText("22.80", 620, 660);
    context.font = "28px Arial, sans-serif";
    context.fillText("Currency: MYR", 80, 745);
    return canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
  });

  return {
    name: "live-gemini-receipt.png",
    mimeType: "image/png",
    buffer: Buffer.from(base64, "base64")
  };
}
