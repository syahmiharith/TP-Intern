import { describe, expect, it } from "vitest";
import {
  createSavedReceiptSubmission,
  extractionToFormValues,
  receiptExtractionSchema,
  validateReceiptForm
} from "@/lib/receipt";
import { normalizeReceiptExtraction } from "@/lib/receipt-normalizer";

describe("receiptExtractionSchema", () => {
  it("accepts a complete valid extraction", () => {
    const result = receiptExtractionSchema.parse({
      merchantName: "FamilyMart",
      date: "2026-05-11",
      totalAmount: 12000,
      currency: "KRW",
      confidence: "high",
      warnings: []
    });

    expect(result).toEqual({
      merchantName: "FamilyMart",
      date: "2026-05-11",
      totalAmount: 12000,
      currency: "KRW",
      confidence: "high",
      warnings: []
    });
  });

  it("applies safe defaults for optional confidence and warnings", () => {
    const result = receiptExtractionSchema.parse({
      merchantName: null,
      date: null,
      totalAmount: null,
      currency: null
    });

    expect(result.confidence).toBe("low");
    expect(result.warnings).toEqual([]);
  });
});

describe("normalizeReceiptExtraction", () => {
  it("normalizes amount, currency, merchant, date, and legacy notes", () => {
    const result = normalizeReceiptExtraction({
      merchantName: "  Tealive  ",
      date: "11/05/2026",
      totalAmount: "MYR 8.90",
      currency: "rm",
      confidence: "medium",
      notes: ["Currency inferred from receipt symbol."]
    });

    expect(result).toEqual({
      merchantName: "Tealive",
      date: "2026-05-11",
      totalAmount: 8.9,
      currency: "MYR",
      confidence: "medium",
      warnings: ["Currency inferred from receipt symbol."]
    });
  });

  it("keeps partial extraction as success with warnings", () => {
    const result = normalizeReceiptExtraction({
      merchantName: "Starbucks",
      date: null,
      totalAmount: null,
      currency: "MYR",
      confidence: "low",
      warnings: ["Receipt is blurry."]
    });

    expect(result.merchantName).toBe("Starbucks");
    expect(result.date).toBeNull();
    expect(result.totalAmount).toBeNull();
    expect(result.warnings).toContain("Receipt is blurry.");
    expect(result.warnings).toContain("Date could not be confidently extracted. Please enter it manually.");
    expect(result.warnings).toContain("Total amount could not be confidently extracted. Please enter it manually.");
  });
});

describe("extractionToFormValues", () => {
  it("converts extraction output into editable form strings", () => {
    const formValues = extractionToFormValues({
      merchantName: "Starbucks",
      date: "2026-05-11",
      totalAmount: 25.9,
      currency: "MYR",
      confidence: "medium",
      warnings: ["Tax line was ignored.", "Currency inferred from symbol."]
    });

    expect(formValues).toEqual({
      merchantName: "Starbucks",
      date: "2026-05-11",
      totalAmount: "25.9",
      currency: "MYR",
      notes: "Tax line was ignored.\nCurrency inferred from symbol."
    });
  });

  it("uses empty strings for null extracted values", () => {
    const formValues = extractionToFormValues({
      merchantName: null,
      date: null,
      totalAmount: null,
      currency: null,
      confidence: "low",
      warnings: []
    });

    expect(formValues).toEqual({
      merchantName: "",
      date: "",
      totalAmount: "",
      currency: "",
      notes: ""
    });
  });
});

describe("createSavedReceiptSubmission", () => {
  it("stores reviewed values in a structured local submission envelope", () => {
    const submission = createSavedReceiptSubmission({
      id: "receipt-1",
      createdAt: "2026-05-13T00:00:00.000Z",
      sourceFileName: "receipt.png",
      values: {
        merchantName: " Manual Cafe ",
        date: "2026-05-11",
        totalAmount: "15.50",
        currency: "myr",
        notes: " Corrected manually. "
      }
    });

    expect(submission).toEqual({
      id: "receipt-1",
      createdAt: "2026-05-13T00:00:00.000Z",
      sourceFileName: "receipt.png",
      data: {
        merchantName: "Manual Cafe",
        date: "2026-05-11",
        totalAmount: "15.50",
        currency: "MYR",
        notes: "Corrected manually."
      }
    });
  });
});

describe("validateReceiptForm", () => {
  it("returns no errors for valid values", () => {
    const errors = validateReceiptForm({
      merchantName: "Tealive",
      date: "2026-05-11",
      totalAmount: "12.50",
      currency: "MYR",
      notes: "Reviewed by user."
    });

    expect(errors).toEqual({});
  });

  it("requires merchant name", () => {
    const errors = validateReceiptForm({
      merchantName: "   ",
      date: "2026-05-11",
      totalAmount: "12.50",
      currency: "MYR",
      notes: ""
    });

    expect(errors.merchantName).toBe("Merchant name is required.");
  });

  it("requires date", () => {
    const errors = validateReceiptForm({
      merchantName: "Tealive",
      date: "",
      totalAmount: "12.50",
      currency: "MYR",
      notes: ""
    });

    expect(errors.date).toBe("Date is required.");
  });

  it.each(["", "0", "-1", "abc"])("rejects invalid total amount: %s", (totalAmount) => {
    const errors = validateReceiptForm({
      merchantName: "Tealive",
      date: "2026-05-11",
      totalAmount,
      currency: "MYR",
      notes: ""
    });

    expect(errors.totalAmount).toBe("Total amount must be a number greater than 0.");
  });

  it.each(["", "RM", "MYRR", "M1R"])("rejects invalid currency: %s", (currency) => {
    const errors = validateReceiptForm({
      merchantName: "Tealive",
      date: "2026-05-11",
      totalAmount: "12.50",
      currency,
      notes: ""
    });

    expect(errors.currency).toBeDefined();
  });
});
