import { describe, it, expect } from "vitest";
import { expensesCsv } from "@/lib/expense-workflow";
import { emptyReceiptForm, validateReceiptForm, formValuesToExtraction } from "@/lib/receipt";

describe("expense contracts", () => {
  const values = { ...emptyReceiptForm, merchantName: "Cafe", receiptType: "Other" as const, date: "2026-11-05", totalAmount: "12.50", currency: "USD" };
  it("rejects impossible dates, unsupported currencies and numeric formats", () => {
    expect(validateReceiptForm({ ...values, date: "2026-02-30" }).date).toBeTruthy();
    expect(validateReceiptForm({ ...values, currency: "ZZZ" }).currency).toBeTruthy();
    for (const totalAmount of ["Infinity", "1e3", "1,234", "0", "-1", "1.234"]) expect(validateReceiptForm({ ...values, totalAmount }).totalAmount).toBeTruthy();
    expect(validateReceiptForm({ ...values, currency: "JPY", totalAmount: "1.50" }).totalAmount).toBeTruthy();
  });
  it("escapes Unicode, quotes, newlines and formula prefixes", () => {
    const csv = expensesCsv([{ id: "source-id", source: "source.png", values: { ...values, merchantName: '=HYPERLINK("x")', notes: "서울,\n台北" }, reviewedAt: "now" }]);
    expect(csv).toContain('"\'=HYPERLINK(""x"")"');
    expect(csv).toContain('"서울,\n台北"');
    expect(csv).toContain('"source-id"');
  });
  it("never upgrades model confidence during correction", () => {
    expect(formValuesToExtraction(values, { merchantName: null, receiptType: null, date: null, currency: null, totalAmount: null, notes: [], items: [], confidence: "low" }).confidence).toBe("low");
  });
});
