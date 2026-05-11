import { z } from "zod";

export const receiptExtractionSchema = z.object({
  merchantName: z.string().nullable(),
  date: z.string().nullable(),
  totalAmount: z.number().nullable(),
  currency: z.string().nullable(),
  confidence: z.enum(["high", "medium", "low"]).default("low"),
  notes: z.array(z.string()).default([])
});

export type ReceiptExtraction = z.infer<typeof receiptExtractionSchema>;

export type ReceiptFormValues = {
  merchantName: string;
  date: string;
  totalAmount: string;
  currency: string;
  notes: string;
};

export const emptyReceiptForm: ReceiptFormValues = {
  merchantName: "",
  date: "",
  totalAmount: "",
  currency: "",
  notes: ""
};

export function extractionToFormValues(extraction: ReceiptExtraction): ReceiptFormValues {
  return {
    merchantName: extraction.merchantName ?? "",
    date: extraction.date ?? "",
    totalAmount: extraction.totalAmount === null ? "" : String(extraction.totalAmount),
    currency: extraction.currency ?? "",
    notes: extraction.notes.join("\n")
  };
}

export function validateReceiptForm(values: ReceiptFormValues) {
  const errors: Partial<Record<keyof ReceiptFormValues, string>> = {};

  if (!values.merchantName.trim()) {
    errors.merchantName = "Merchant name is required.";
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
