import type { ReceiptQueueItem } from "@/app/page";
import { extractionToFormValues, type ReceiptFormValues, type ReceiptExtraction } from "./receipt";

const expiry = 7 * 24 * 60 * 60 * 1000;
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("receipt-expenses", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("batches");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Storage upgrade blocked"));
  });
}
export async function readBatch(): Promise<ReceiptQueueItem[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("batches", "readonly");
    const request = transaction.objectStore("batches").get("current");
    request.onsuccess = () => {
      const record = request.result;
      if (record && record.schemaVersion !== 1) { reject(new Error("Unsupported saved schema")); return; }
      resolve((record?.items ?? []).filter((item: ReceiptQueueItem) => Date.now() - (item.editedAt ?? 0) < expiry));
    };
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}
let pendingWrite = Promise.resolve();
export function writeBatch(items: ReceiptQueueItem[]) {
  const write = pendingWrite.catch(() => {}).then(async () => {
    const db = await database();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("batches", "readwrite");
      transaction.objectStore("batches").put({ schemaVersion: 1, items: items.map((item) => ({ ...item, previewUrl: "" })) }, "current");
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onabort = () => { db.close(); reject(transaction.error); };
      transaction.onerror = () => reject(transaction.error);
    });
  });
  pendingWrite = write;
  return write;
}
export function expensesCsv(rows: { id: string; source: string; values: ReceiptFormValues; reviewedAt: string }[]) {
  function cell(value: string) {
    const safe = /^[\s]*[=+@\-]/.test(value) || /^[\t\r\n]/.test(value) ? "'" + value : value;
    return '"' + safe.replaceAll('"', '""') + '"';
  }
  return ["receipt ID,source filename,merchant,date,category,currency,total,notes,reviewed timestamp", ...rows.map(({ id, source, values: v, reviewedAt }) => [id, source, v.merchantName, v.date, v.receiptType || "Other", v.currency.toUpperCase(), v.totalAmount, v.notes, reviewedAt].map(cell).join(","))].join("\r\n");
}
export function sampleReceipt(merchant: string, actual: string, extracted: string): ReceiptQueueItem {
  const canvas = document.createElement("canvas"); canvas.width = 400; canvas.height = 500;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#fff"; context.fillRect(0, 0, 400, 500);
  context.fillStyle = "#111"; context.font = "20px monospace";
  ["SYNTHETIC SAMPLE", merchant, "2026-11-05", "Total USD " + actual].forEach((line, index) => context.fillText(line, 24, 70 + index * 70));
  const bytes = Uint8Array.from(atob(canvas.toDataURL("image/png").split(",")[1]), (c) => c.charCodeAt(0));
  const file = new File([bytes], merchant + ".png", { type: "image/png" });
  const extraction: ReceiptExtraction = { merchantName: merchant, date: "2026-11-05", totalAmount: Number(extracted), currency: "USD", confidence: actual === extracted ? "high" : "low", receiptType: "Other", notes: ["Synthetic sample. Check total against source image."], items: [] };
  const formValues = extractionToFormValues(extraction);
  return { id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file), selected: true, expanded: true, status: "needs-review", progress: 100, extraction, formValues, savedValues: { ...formValues }, editedAt: Date.now(), extractedAt: new Date().toISOString(), errors: {}, errorMessage: null, isNewResult: true, resultSeen: false };
}
