import { z } from "zod";

export const allowedReceiptImageTypes = ["image/jpeg", "image/png", "image/webp"] as const;
export const maxReceiptImageSizeBytes = 5 * 1024 * 1024;

export type ExtractionErrorCode =
  | "NO_RECEIPT_UPLOADED"
  | "INVALID_FILE_TYPE"
  | "FILE_TOO_LARGE"
  | "RATE_LIMITED"
  | "AI_PROVIDER_ERROR"
  | "INVALID_AI_RESPONSE"
  | "UNKNOWN_ERROR";

export const receiptTypes = [
  "Food & Beverage",
  "Groceries",
  "Retail",
  "Transport",
  "Utilities",
  "Medical",
  "Accommodation",
  "Entertainment",
  "Other"
] as const;

export const receiptLineItemSchema = z.object({
  name: z.string().trim(),
  quantity: z.number().nullable().default(null),
  value: z.number().nullable()
});

export const receiptExtractionSchema = z.object({
  merchantName: z.string().nullable(),
  receiptType: z.enum(receiptTypes).nullable().default(null),
  date: z.string().nullable(),
  totalAmount: z.number().nullable(),
  currency: z.string().nullable(),
  confidence: z.enum(["high", "medium", "low"]).default("low"),
  notes: z.array(z.string()).default([]),
  items: z.array(receiptLineItemSchema).default([])
});

export type ReceiptLineItem = z.infer<typeof receiptLineItemSchema>;
export type ReceiptExtraction = z.infer<typeof receiptExtractionSchema>;

export type ReceiptFormValues = {
  merchantName: string;
  receiptType: (typeof receiptTypes)[number] | "";
  date: string;
  totalAmount: string;
  currency: string;
  notes: string;
};

export type SavedReceiptSubmission = {
  id: string;
  createdAt: string;
  sourceFileName: string;
  data: ReceiptFormValues;
};

export const emptyReceiptForm: ReceiptFormValues = {
  merchantName: "",
  receiptType: "",
  date: "",
  totalAmount: "",
  currency: "",
  notes: ""
};

export function extractionToFormValues(extraction: ReceiptExtraction): ReceiptFormValues {
  return {
    merchantName: extraction.merchantName ?? "",
    receiptType: extraction.receiptType ?? "",
    date: extraction.date ?? "",
    totalAmount: extraction.totalAmount === null ? "" : String(extraction.totalAmount),
    currency: extraction.currency ?? "",
    notes: extraction.notes.join("\n")
  };
}

export function createSavedReceiptSubmission({
  sourceFileName,
  values,
  id = crypto.randomUUID(),
  createdAt = new Date().toISOString()
}: {
  sourceFileName: string;
  values: ReceiptFormValues;
  id?: string;
  createdAt?: string;
}): SavedReceiptSubmission {
  return {
    id,
    createdAt,
    sourceFileName,
    data: {
      merchantName: values.merchantName.trim(),
      receiptType: values.receiptType,
      date: values.date.trim(),
      totalAmount: values.totalAmount.trim(),
      currency: values.currency.trim().toUpperCase(),
      notes: values.notes.trim()
    }
  };
}

export function validateReceiptForm(values: ReceiptFormValues) {
  const errors: Partial<Record<keyof ReceiptFormValues, string>> = {};

  if (!values.merchantName.trim()) {
    errors.merchantName = "Merchant name is required.";
  }

  if (!values.receiptType) {
    errors.receiptType = "Receipt type is required.";
  }

  if (!values.date.trim()) {
    errors.date = "Date is required.";
  }

  const amount = Number(values.totalAmount);
  if (!values.totalAmount.trim() || Number.isNaN(amount) || amount <= 0) {
    errors.totalAmount = "Total amount must be a number greater than 0.";
  }

  if (!values.currency.trim()) {
    errors.currency = "Currency is required.";
  } else if (!/^[A-Za-z]{3}$/.test(values.currency.trim())) {
    errors.currency = "Use a 3-letter currency code, for example MYR, USD, or KRW.";
  }

  return errors;
}

export function isExtractionComplete(extraction: ReceiptExtraction | null) {
  if (!extraction) return false;

  return Boolean(
    extraction.merchantName?.trim() &&
      extraction.receiptType &&
      extraction.currency?.trim() &&
      extraction.totalAmount !== null &&
      extraction.totalAmount > 0 &&
      extraction.date?.trim() &&
      extraction.confidence !== "low"
  );
}

export function formValuesToExtraction(
  values: ReceiptFormValues,
  existing: ReceiptExtraction | null
): ReceiptExtraction {
  return receiptExtractionSchema.parse({
    merchantName: values.merchantName.trim() || null,
    receiptType: values.receiptType || null,
    date: values.date.trim() || null,
    totalAmount: values.totalAmount.trim() ? Number(values.totalAmount) : null,
    currency: values.currency.trim() ? values.currency.trim().toUpperCase() : null,
    confidence: existing?.confidence === "low" ? "medium" : existing?.confidence ?? "medium",
    notes: values.notes
      .split("\n")
      .map((note) => note.trim())
      .filter(Boolean),
    items: existing?.items ?? []
  });
}
