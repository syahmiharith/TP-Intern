import { z } from "zod";
import { ReceiptExtraction, receiptExtractionSchema, receiptTypes } from "@/lib/receipt";

const rawReceiptExtractionSchema = z.object({
  merchantName: z.unknown().optional(),
  receiptType: z.unknown().optional(),
  date: z.unknown().optional(),
  totalAmount: z.unknown().optional(),
  currency: z.unknown().optional(),
  confidence: z.unknown().optional(),
  warnings: z.unknown().optional(),
  notes: z.unknown().optional(),
  items: z.unknown().optional()
}).passthrough();

function cleanString(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return null;

  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

function normalizeAmount(value: unknown) {
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

function normalizeCurrency(value: unknown) {
  const cleaned = cleanString(value);
  if (!cleaned) return null;

  const upper = cleaned.toUpperCase();
  if (upper === "RM" || upper.includes("RINGGIT")) {
    return "MYR";
  }

  const code = upper.match(/[A-Z]{3}/)?.[0];
  return code ?? null;
}

function normalizeDate(value: unknown) {
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

function normalizeReceiptType(value: unknown) {
  const cleaned = cleanString(value);
  if (!cleaned) return null;

  const match = receiptTypes.find((type) => type.toLowerCase() === cleaned.toLowerCase());
  return match ?? "Other";
}

function normalizeConfidence(value: unknown) {
  const cleaned = cleanString(value)?.toLowerCase();
  if (cleaned === "high" || cleaned === "medium" || cleaned === "low") return cleaned;
  return "low";
}

function normalizeNotes(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((note) => cleanString(note)).filter((note): note is string => Boolean(note));
  }

  const note = cleanString(value);
  return note ? [note] : [];
}

function normalizeNumberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const parsed = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function readObjectValue(value: unknown, keys: string[]) {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  return keys.map((key) => record[key]).find((candidate) => candidate !== undefined);
}

function normalizeLineItems(items: unknown) {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => ({
      name: cleanString(readObjectValue(item, ["name", "item", "description", "label"])) ?? "",
      quantity: normalizeNumberOrNull(readObjectValue(item, ["quantity", "qty"])),
      value: normalizeNumberOrNull(readObjectValue(item, ["value", "price", "amount", "total"]))
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
    confidence: normalizeConfidence(parsed.confidence),
    notes: [...normalizeNotes(parsed.notes), ...normalizeNotes(parsed.warnings)],
    items: normalizeLineItems(parsed.items)
  });

  return {
    ...normalized,
    notes: buildWarnings(normalized)
  };
}
