import {chooseExport} from './support/actions';
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { storedImageCount } from "./support/receipt";

test("live corrections survive refresh and export without review",async({page})=>{
 await page.goto("/");await page.getByRole("button",{name:"Try samples"}).click();
 await page.getByRole("button",{name:"Deselect Sample cafe.png",exact:true}).click();
 const row=page.locator("article").nth(1);const total=row.getByLabel("Total Amount",{exact:true});
 await expect(page.getByRole("button",{name:"Export",exact:true})).toBeEnabled();
 await total.fill("0");await expect(page.getByRole("button",{name:"Export",exact:true})).toBeDisabled();
 await total.fill("28.00");await page.waitForTimeout(300);await page.reload();
 await expect(total).toHaveValue("28.00");await expect(row.getByText("Extraction confidence low",{exact:true})).toBeVisible();
 const pending=page.waitForEvent("download");await chooseExport(page,'CSV');
 const csv=await readFile((await(await pending).path())!,"utf8");expect(csv).toContain('"28.00"');expect(csv).toContain('"Sample stationery.png"');
 const jsonPending=page.waitForEvent("download");await chooseExport(page,'JSON');
 const [record]=JSON.parse(await readFile((await(await jsonPending).path())!,"utf8"));
 expect(record.values.totalAmount).toBe("28.00");expect(record.originalExtraction.confidence).toBe("low");expect(csv).toContain(record.receiptId);
 await expect(page.getByRole("button",{name:/Mark reviewed|Save changes|Discard changes/})).toHaveCount(0);
});
for(const width of [375,768,1280])test(`all receipt details fit ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.goto("/");await page.getByRole("button",{name:"Try samples"}).click();
 const row=page.locator("article").first();await expect(row.getByLabel("Merchant Name",{exact:true})).toBeVisible();
 await expect(row.getByAltText("Inline preview of Sample cafe.png")).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test("deletion persists and unavailable storage is explained", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try samples" }).click();
  await page.getByRole("button", { name: "Clear all saved receipts" }).click();
  await page.waitForTimeout(300);
  await page.reload();
  await expect(page.getByText("Upload receipts")).toBeVisible();
  await page.addInitScript(() => { Object.defineProperty(window, "indexedDB", { get() { throw new Error("Storage unavailable"); } }); });
  await page.reload();
  await expect(page.getByText(/Saved data could not be opened|Could not save on this device/)).toBeVisible();
  await page.getByRole("button", { name: "Try samples" }).click();
  await expect(page.getByText(/Saved data could not be opened|Could not save on this device/)).toBeVisible();
});

test("expired saved receipts are removed on return", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try samples" }).click();
  await expect.poll(() => storedImageCount(page)).toBe(2);
  await page.route("**/expiry-fixture", route => route.fulfill({contentType:"text/html",body:"<title>Expiry fixture</title>"}));
  await page.goto("/expiry-fixture");
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open("receipt-expenses");
      open.onsuccess = () => {
        const db = open.result;
        const transaction = db.transaction("batches", "readwrite");
        const store = transaction.objectStore("batches");
        const get = store.get("current");
        get.onsuccess = () => {
          const saved = get.result;
          saved.items.forEach((item: { editedAt: number }) => { item.editedAt = Date.now() - 8 * 86400000; });
          store.put(saved, "current");
        };
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  });
  await page.goto("/");
  await expect(page.getByText("Upload receipts")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try samples" })).toBeEnabled();
  await expect(page.getByText("Sample cafe.png", { exact: true })).toHaveCount(0);
  await expect.poll(() => storedImageCount(page)).toBe(0);
});

test("mixed batch retries failures without replacing successful receipts", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/extract-receipt", async (route) => {
    calls += 1;
    if (calls === 2) { await route.fulfill({ status: 503, json: { error: "Provider unavailable" } }); return; }
    await route.fulfill({ json: { data: { merchantName: "Cafe", receiptType: "Other", date: "2026-11-05", totalAmount: 12, currency: "USD", confidence: "low", notes: [], items: [] } } });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Try samples" })).toBeEnabled();
  await page.locator('input[type="file"]').first().setInputFiles([
    { name: "first.png", mimeType: "image/png", buffer: Buffer.from("first") },
    { name: "second.png", mimeType: "image/png", buffer: Buffer.from("second") }
  ]);
  await page.getByRole("button", { name: "Extract", exact: true }).click();
  await expect(page.locator("article").nth(1).getByText("Failed", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Extract", exact: true }).click();
  await expect(page.getByText("Provider unavailable", { exact: true })).toHaveCount(0);
  expect(calls).toBe(3);
  await expect(page.getByText("first.png", { exact: true })).toBeVisible();
});
