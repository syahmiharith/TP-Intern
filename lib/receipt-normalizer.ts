import { z } from "zod";
import { ReceiptExtraction, receiptExtractionSchema, receiptTypes } from "@/lib/receipt";

const rawReceiptExtractionSchema = z.object({
  merchantName: z.string().nullable().optional(),
  receiptType: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
  totalAmount: z.union([z.number(), z.string()]).nullable().optional(),
  currency: z.string().nullable().optional(),
  confidence: z.enum(["high", "medium", "low"]).default("low"),
  warnings: z.array(z.string()).optional(),
  notes: z.array(z.string()).optional(),
  items: z
    .array(
      z.object({
        name: z.string().optional(),
        quantity: z.union([z.number(), z.string()]).nullable().optional(),
        value: z.union([z.number(), z.string()]).nullable().optional()
      })
    )
    .optional()
});

function cleanString(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeAmount(value: number | string | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const cleaned = cleanString(value);
  if (!cleaned) return null;

  const match = cleaned.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCurrency(value: string | null | undefined) {
  const cleaned = cleanString(value);
  if (!cleaned) return null;

  const upper = cleaned.toUpperCase();
  if (upper === "RM" || upper.includes("RINGGIT")) {
    return "MYR";
  }

  const code = upper.match(/[A-Z]{3}/)?.[0];
  return code ?? null;
}

function normalizeDate(value: string | null | undefined) {
  const cleaned = cleanString(value);
  if (!cleaned) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return cleaned;
  }

  const slashDate = cleaned.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!slashDate) return cleaned;

  const [, day, month, year] = slashDate;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function normalizeReceiptType(value: string | null | undefined) {
  const cleaned = cleanString(value);
  if (!cleaned) return null;

  const match = receiptTypes.find((type) => type.toLowerCase() === cleaned.toLowerCase());
  return match ?? "Other";
}

function normalizeNumberOrNull(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const parsed = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeLineItems(items: z.infer<typeof rawReceiptExtractionSchema>["items"]) {
  return (items ?? [])
    .map((item) => ({
      name: item.name?.trim() ?? "",
      quantity: normalizeNumberOrNull(item.quantity),
      value: normalizeNumberOrNull(item.value)
    }))
    .filter((item) => item.name.length > 0);
}

function buildWarnings({
  merchantName,
  receiptType,
  date,
  totalAmount,
  currency,
  notes
}: ReceiptExtraction) {
  const merged = new Set(notes.map((warning) => warning.trim()).filter(Boolean));

  if (!merchantName) merged.add("Merchant name could not be confidently extracted. Please enter it manually.");
  if (!receiptType) merged.add("Receipt type could not be confidently classified. Please select it manually.");
  if (!date) merged.add("Date could not be confidently extracted. Please enter it manually.");
  if (totalAmount === null) merged.add("Total amount could not be confidently extracted. Please enter it manually.");
  if (!currency) merged.add("Currency could not be confidently extracted. Please enter it manually.");

  return Array.from(merged);
}

export function normalizeReceiptExtraction(raw: unknown): ReceiptExtraction {
  const parsed = rawReceiptExtractionSchema.parse(raw);
  const normalized = receiptExtractionSchema.parse({
    merchantName: cleanString(parsed.merchantName),
    receiptType: normalizeReceiptType(parsed.receiptType),
    date: normalizeDate(parsed.date),
    totalAmount: normalizeAmount(parsed.totalAmount),
    currency: normalizeCurrency(parsed.currency),
    confidence: parsed.confidence,
    notes: [...(parsed.notes ?? []), ...(parsed.warnings ?? [])],
    items: normalizeLineItems(parsed.items)
  });

  return {
    ...normalized,
    notes: buildWarnings(normalized)
  };
}
