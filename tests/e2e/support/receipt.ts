import { expect, Locator, Page, Request } from "@playwright/test";

export type Confidence = "high" | "medium" | "low";

export type MockExtraction = {
  merchantName: string | null;
  date: string | null;
  totalAmount: number | null;
  currency: string | null;
  confidence: Confidence;
  notes: string[];
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
  date: "2026-05-11",
  totalAmount: 12000,
  currency: "KRW",
  confidence: "high",
  notes: ["Clear receipt image."]
};

export const mediumConfidenceExtraction: MockExtraction = {
  merchantName: "Tealive",
  date: "2026-05-10",
  totalAmount: 8.9,
  currency: "MYR",
  confidence: "medium",
  notes: ["Currency inferred from receipt symbol."]
};

export const lowConfidenceExtraction: MockExtraction = {
  merchantName: null,
  date: null,
  totalAmount: null,
  currency: null,
  confidence: "low",
  notes: ["Receipt is blurry. Please verify all fields."]
};

export function extractButton(page: Page) {
  return page.getByRole("button", { name: /extract data with ai|extracting receipt data/i });
}

export function submitButton(page: Page) {
  return page.getByRole("button", { name: /submit final data/i });
}

export function merchantNameInput(page: Page) {
  return page.getByRole("textbox", { name: "Merchant Name" });
}

export function dateInput(page: Page) {
  return page.getByRole("textbox", { name: "Date" });
}

export function totalAmountInput(page: Page) {
  return page.getByRole("spinbutton", { name: "Total Amount" });
}

export function currencyInput(page: Page) {
  return page.getByRole("textbox", { name: "Currency" });
}

export function notesInput(page: Page) {
  return page.getByRole("textbox", { name: "Notes" });
}

export async function typeTextInput(locator: Locator, value: string) {
  await locator.evaluate(
    (element, nextValue) => {
      const prototype =
        element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const valueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

      if (!valueSetter) {
        throw new Error("Unable to set text field value.");
      }

      valueSetter.call(element, nextValue);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    },
    value
  );
  await expect(locator).toHaveValue(value);
}

export async function gotoHome(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /ai receipt scanner for instant form auto-fill/i })).toBeVisible();
}

export async function uploadReceipt(page: Page, file = defaultReceiptFile) {
  await page.locator('input[type="file"]').setInputFiles(file);

  if (["image/jpeg", "image/png", "image/webp"].includes(file.mimeType) && file.buffer.length <= 5 * 1024 * 1024) {
    await expect(extractButton(page)).toBeEnabled();
  }
}

export async function expectReceiptPreview(page: Page, fileName: string) {
  await expect(page.getByText(fileName)).toBeVisible();
  await expect(page.getByRole("img", { name: "Receipt preview" })).toBeVisible();
  await expect(extractButton(page)).toBeEnabled();
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
  await extractButton(page).click();
}

export async function expectFormValues(
  page: Page,
  values: {
    merchantName?: string;
    date?: string;
    totalAmount?: string;
    currency?: string;
    notes?: string;
  }
) {
  if (values.merchantName !== undefined) {
    await expect(merchantNameInput(page)).toHaveValue(values.merchantName);
  }

  if (values.date !== undefined) {
    await expect(dateInput(page)).toHaveValue(values.date);
  }

  if (values.totalAmount !== undefined) {
    await expect(totalAmountInput(page)).toHaveValue(values.totalAmount);
  }

  if (values.currency !== undefined) {
    await expect(currencyInput(page)).toHaveValue(values.currency);
  }

  if (values.notes !== undefined) {
    await expect(notesInput(page)).toHaveValue(values.notes);
  }
}

export async function fillValidReceiptForm(page: Page) {
  await typeTextInput(merchantNameInput(page), "Manual Cafe");
  await dateInput(page).fill("2026-05-11");
  await totalAmountInput(page).fill("15.50");
  await typeTextInput(currencyInput(page), "myr");
  await typeTextInput(notesInput(page), "Corrected manually.");
}

export async function readLatestSubmission(page: Page) {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem("latestReceiptSubmission");
    return raw ? JSON.parse(raw) : null;
  });
}

export async function expectLatestSubmission(
  page: Page,
  expected: {
    merchantName: string;
    date: string;
    totalAmount: string;
    currency: string;
    notes: string;
  }
) {
  await expect(page.getByText(/receipt data submitted successfully/i)).toBeVisible();
  await expect(page.locator("pre")).toContainText(expected.merchantName);
  await expect(page.locator("pre")).toContainText(expected.currency);
  await expect(readLatestSubmission(page)).resolves.toEqual(expected);
}

export async function createGeneratedReceiptPng(page: Page) {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 1100;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Unable to create receipt image.");
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#111827";
    context.textBaseline = "top";
    context.font = "700 44px Arial, sans-serif";
    context.fillText("TP INTERN TEST MART", 80, 80);
    context.font = "28px Arial, sans-serif";
    context.fillText("123 Assessment Road", 80, 155);
    context.fillText("Date: 2026-05-11", 80, 245);
    context.fillText("Receipt No: AI-2026-0511", 80, 305);
    context.fillText("Coffee", 80, 420);
    context.fillText("8.50", 650, 420);
    context.fillText("Sandwich", 80, 480);
    context.fillText("12.40", 650, 480);
    context.fillText("Tax", 80, 540);
    context.fillText("1.90", 650, 540);
    context.font = "700 42px Arial, sans-serif";
    context.fillText("TOTAL MYR", 80, 660);
    context.fillText("22.80", 620, 660);
    context.font = "28px Arial, sans-serif";
    context.fillText("Currency: MYR", 80, 745);
    context.fillText("Thank you", 80, 860);

    return canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
  });

  return {
    name: "live-gemini-receipt.png",
    mimeType: "image/png",
    buffer: Buffer.from(base64, "base64")
  };
}
