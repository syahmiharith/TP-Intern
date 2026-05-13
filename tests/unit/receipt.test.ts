import { describe, expect, it } from "vitest";
import {
  createSavedReceiptSubmission,
  extractionToFormValues,
  formValuesToExtraction,
  isExtractionComplete,
  receiptExtractionSchema,
  validateReceiptForm
} from "@/lib/receipt";
import { normalizeReceiptExtraction } from "@/lib/receipt-normalizer";

function validForm(overrides = {}) {
  return {
    merchantName: "Tealive",
    receiptType: "Food & Beverage" as const,
    date: "2026-05-11",
    totalAmount: "12.50",
    currency: "MYR",
    notes: "Reviewed by user.",
    ...overrides
  };
}

describe("receiptExtractionSchema", () => {
  it("accepts a complete valid extraction", () => {
    const result = receiptExtractionSchema.parse({
      merchantName: "FamilyMart",
      receiptType: "Groceries",
      date: "2026-05-11",
      totalAmount: 12000,
      currency: "KRW",
      confidence: "high",
      notes: [],
      items: [{ name: "Iced Coffee", quantity: 1, value: 8.9 }]
    });

    expect(result).toEqual({
      merchantName: "FamilyMart",
      receiptType: "Groceries",
      date: "2026-05-11",
      totalAmount: 12000,
      currency: "KRW",
      confidence: "high",
      notes: [],
      items: [{ name: "Iced Coffee", quantity: 1, value: 8.9 }]
    });
  });

  it("applies safe defaults for optional confidence, notes, type, and items", () => {
    const result = receiptExtractionSchema.parse({
      merchantName: null,
      date: null,
      totalAmount: null,
      currency: null
    });

    expect(result.confidence).toBe("low");
    expect(result.receiptType).toBeNull();
    expect(result.notes).toEqual([]);
    expect(result.items).toEqual([]);
  });
});

describe("normalizeReceiptExtraction", () => {
  it("normalizes amount, currency, merchant, type, date, notes, and items", () => {
    const result = normalizeReceiptExtraction({
      merchantName: "  Tealive  ",
      receiptType: "food & beverage",
      date: "11/05/2026",
      totalAmount: "MYR 8.90",
      currency: "rm",
      confidence: "medium",
      notes: ["Currency inferred from receipt symbol."],
      items: [{ name: " Milk Tea ", quantity: "2", value: "8.90" }]
    });

    expect(result).toEqual({
      merchantName: "Tealive",
      receiptType: "Food & Beverage",
      date: "2026-05-11",
      totalAmount: 8.9,
      currency: "MYR",
      confidence: "medium",
      notes: ["Currency inferred from receipt symbol."],
      items: [{ name: "Milk Tea", quantity: 2, value: 8.9 }]
    });
  });

  it("keeps partial extraction as success with review notes", () => {
    const result = normalizeReceiptExtraction({
      merchantName: "Starbucks",
      date: null,
      totalAmount: null,
      currency: "MYR",
      confidence: "low",
      warnings: ["Receipt is blurry."]
    });

    expect(result.merchantName).toBe("Starbucks");
    expect(result.receiptType).toBeNull();
    expect(result.date).toBeNull();
    expect(result.totalAmount).toBeNull();
    expect(result.notes).toContain("Receipt is blurry.");
    expect(result.notes).toContain("Receipt type could not be confidently classified. Please select it manually.");
    expect(result.notes).toContain("Date could not be confidently extracted. Please enter it manually.");
    expect(result.notes).toContain("Total amount could not be confidently extracted. Please enter it manually.");
  });
});

describe("extractionToFormValues", () => {
  it("converts extraction output into editable form strings", () => {
    const formValues = extractionToFormValues({
      merchantName: "Starbucks",
      receiptType: "Food & Beverage",
      date: "2026-05-11",
      totalAmount: 25.9,
      currency: "MYR",
      confidence: "medium",
      notes: ["Tax line was ignored.", "Currency inferred from symbol."],
      items: []
    });

    expect(formValues).toEqual({
      merchantName: "Starbucks",
      receiptType: "Food & Beverage",
      date: "2026-05-11",
      totalAmount: "25.9",
      currency: "MYR",
      notes: "Tax line was ignored.\nCurrency inferred from symbol."
    });
  });
});

describe("completion and form conversion", () => {
  it("requires core fields and non-low confidence for completion", () => {
    expect(
      isExtractionComplete({
        merchantName: "AEON Wellness",
        receiptType: "Groceries",
        date: "2026-05-12",
        totalAmount: 43.8,
        currency: "MYR",
        confidence: "high",
        notes: [],
        items: []
      })
    ).toBe(true);

    expect(
      isExtractionComplete({
        merchantName: "AEON Wellness",
        receiptType: "Groceries",
        date: "2026-05-12",
        totalAmount: 43.8,
        currency: "MYR",
        confidence: "low",
        notes: ["Blurry total."],
        items: []
      })
    ).toBe(false);
  });

  it("creates an extraction from manually fixed form values", () => {
    expect(formValuesToExtraction(validForm(), null)).toMatchObject({
      merchantName: "Tealive",
      receiptType: "Food & Beverage",
      totalAmount: 12.5,
      currency: "MYR",
      confidence: "medium",
      notes: ["Reviewed by user."]
    });
  });
});

describe("createSavedReceiptSubmission", () => {
  it("stores reviewed values in a structured local submission envelope", () => {
    const submission = createSavedReceiptSubmission({
      id: "receipt-1",
      createdAt: "2026-05-13T00:00:00.000Z",
      sourceFileName: "receipt.png",
      values: validForm({
        merchantName: " Manual Cafe ",
        receiptType: "Retail",
        totalAmount: "15.50",
        currency: "myr",
        notes: " Corrected manually. "
      })
    });

    expect(submission).toMatchObject({
      id: "receipt-1",
      createdAt: "2026-05-13T00:00:00.000Z",
      sourceFileName: "receipt.png",
      data: {
        merchantName: "Manual Cafe",
        receiptType: "Retail",
        totalAmount: "15.50",
        currency: "MYR",
        notes: "Corrected manually."
      }
    });
  });
});

describe("validateReceiptForm", () => {
  it("returns no errors for valid values", () => {
    expect(validateReceiptForm(validForm())).toEqual({});
  });

  it("requires merchant name and receipt type", () => {
    const errors = validateReceiptForm(validForm({ merchantName: "   ", receiptType: "" }));

    expect(errors.merchantName).toBe("Merchant name is required.");
    expect(errors.receiptType).toBe("Receipt type is required.");
  });

  it("requires date", () => {
    expect(validateReceiptForm(validForm({ date: "" })).date).toBe("Date is required.");
  });

  it.each(["", "0", "-1", "abc"])("rejects invalid total amount: %s", (totalAmount) => {
    expect(validateReceiptForm(validForm({ totalAmount })).totalAmount).toBe(
      "Total amount must be a number greater than 0."
    );
  });

  it.each(["", "RM", "MYRR", "M1R"])("rejects invalid currency: %s", (currency) => {
    expect(validateReceiptForm(validForm({ currency })).currency).toBeDefined();
  });
});
