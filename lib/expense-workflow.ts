import type { ReceiptQueueItem } from "@/app/page";
import { extractionToFormValues, type ReceiptFormValues, type ReceiptExtraction } from "./receipt";

const expiry = 7 * 24 * 60 * 60 * 1000;
type StoredImage = { name: string; type: string; lastModified: number; bytes: ArrayBuffer };
type StoredReceipt = Omit<ReceiptQueueItem, "file" | "previewUrl">;
type StoredBatch =
  | { schemaVersion: 1; items: ReceiptQueueItem[] }
  | { schemaVersion: 2; items: StoredReceipt[] };
const imageCache = new WeakMap<File, Promise<StoredImage>>();

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("receipt-expenses", 2);
    let blocked = false;
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("batches")) db.createObjectStore("batches");
      if (!db.objectStoreNames.contains("images")) db.createObjectStore("images");
    };
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) { db.close(); return; }
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      blocked = true;
      reject(new Error("Storage upgrade blocked. Close other Receipt-to-Form tabs and reload."));
    };
  });
}

export async function readBatch(): Promise<ReceiptQueueItem[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["batches", "images"], "readonly");
    const request = transaction.objectStore("batches").get("current");
    request.onsuccess = () => {
      const record = request.result as StoredBatch | undefined;
      if (!record) { resolve([]); return; }
      if (![1, 2].includes(record.schemaVersion) || !Array.isArray(record.items)) {
        reject(new Error("Unsupported saved schema"));
        return;
      }
      const currentItems = record.items.filter((item) => Date.now() - (item.editedAt ?? 0) < expiry);
      if (record.schemaVersion === 1) {
        resolve(currentItems as ReceiptQueueItem[]);
        return;
      }
      const images = transaction.objectStore("images");
      const restored = currentItems.map((item) => new Promise<ReceiptQueueItem>((resolveItem, rejectItem) => {
        const imageRequest = images.get(item.id);
        imageRequest.onsuccess = () => {
          const image = imageRequest.result as StoredImage | undefined;
          if (!image || !(image.bytes instanceof ArrayBuffer)) {
            rejectItem(new Error("Saved receipt image is unavailable"));
            return;
          }
          const file = new File([image.bytes], image.name, { type: image.type, lastModified: image.lastModified });
          imageCache.set(file, Promise.resolve(image));
          resolveItem({ ...item, file, previewUrl: "" });
        };
        imageRequest.onerror = () => rejectItem(imageRequest.error);
      }));
      Promise.all(restored).then(resolve, reject);
    };
    request.onerror = () => reject(request.error);
    transaction.onabort = () => { db.close(); reject(transaction.error); };
    transaction.oncomplete = () => db.close();
  });
}

let pendingWrite = Promise.resolve();
export function writeBatch(items: ReceiptQueueItem[]) {
  const write = pendingWrite.catch(() => {}).then(async () => {
    const prepared = await Promise.all(items.map(async (item) => {
      const { file, ...state } = item;
      let image = imageCache.get(file);
      if (!image) {
        image = file.arrayBuffer().then((bytes) => ({ name: file.name, type: file.type, lastModified: file.lastModified, bytes }));
        imageCache.set(file, image);
      }
      return { state: { ...state, previewUrl: "" }, image: await image };
    }));
    const db = await database();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(["batches", "images"], "readwrite");
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onabort = () => { db.close(); reject(transaction.error); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
      const images = transaction.objectStore("images");
      const keys = images.getAllKeys();
      keys.onsuccess = () => {
        try {
          const existing = new Set(keys.result);
          const retained = new Set(items.map((item) => item.id));
          for (const key of existing) if (!retained.has(String(key))) images.delete(key);
          for (const item of prepared) if (!existing.has(item.state.id)) images.put(item.image, item.state.id);
          transaction.objectStore("batches").put({ schemaVersion: 2, items: prepared.map((item) => item.state) }, "current");
        } catch (error) {
          transaction.abort();
          db.close();
          reject(error);
        }
      };
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
  return ["receipt ID,source filename,merchant,date,category,currency,total,notes,reviewed timestamp", ...rows.map(({ id, source, values: v, reviewedAt }) => [id, source, v.merchantName, v.date, v.receiptType || "Other", v.currency.trim().toUpperCase(), v.totalAmount, v.notes, reviewedAt].map(cell).join(","))].join("\r\n");
}
export function sampleReceipt(merchant: string, actual: string, extracted: string, note = ""): ReceiptQueueItem {
  const canvas = document.createElement("canvas"); canvas.width = 400; canvas.height = 500;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#fff"; context.fillRect(0, 0, 400, 500);
  context.fillStyle = "#111"; context.font = "20px monospace";
  ["SAMPLE RECEIPT", merchant, "2026-11-05", "Total USD " + actual].forEach((line, index) => context.fillText(line, 24, 70 + index * 70));
  const bytes = Uint8Array.from(atob(canvas.toDataURL("image/png").split(",")[1]), (c) => c.charCodeAt(0));
  const file = new File([bytes], merchant + ".png", { type: "image/png" });
  const extraction: ReceiptExtraction = { merchantName: merchant, date: "2026-11-05", totalAmount: Number(extracted), currency: "USD", confidence: actual === extracted ? "high" : "low", receiptType: "Other", notes: note ? [note] : [], items: [] };
  const formValues = extractionToFormValues(extraction);
  return { id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file), selected: true, expanded: true, status: "needs-review", progress: 100, extraction, formValues, savedValues: { ...formValues }, editedAt: Date.now(), extractedAt: new Date().toISOString(), errors: {}, errorMessage: null, isNewResult: true, resultSeen: false };
}
