import { describe, expect, it } from "vitest";
import { extractionToFormValues, receiptExtractionSchema, validateReceiptForm } from "@/lib/receipt";

describe("receiptExtractionSchema", () => {
  it("accepts a complete valid extraction", () => {
    const result = receiptExtractionSchema.parse({
      merchantName: "FamilyMart",
      date: "2026-05-11",
      totalAmount: 12000,
      currency: "KRW",
      confidence: "high",
      notes: []
    });

    expect(result).toEqual({
      merchantName: "FamilyMart",
      date: "2026-05-11",
      totalAmount: 12000,
      currency: "KRW",
      confidence: "high",
      notes: []
    });
  });

  it("applies safe defaults for optional confidence and notes", () => {
    const result = receiptExtractionSchema.parse({
      merchantName: null,
      date: null,
      totalAmount: null,
      currency: null
    });

    expect(result.confidence).toBe("low");
    expect(result.notes).toEqual([]);
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
      notes: ["Tax line was ignored.", "Currency inferred from symbol."]
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
      notes: []
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
