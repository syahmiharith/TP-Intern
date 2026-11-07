import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { storedImageCount } from "./support/receipt";

test("reviewed corrections survive refresh and CSV uses current reviewed values", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try samples" }).click();
  await page.getByRole("button", { name: "Mark reviewed", exact: true }).nth(1).click();
  const total = page.getByRole("spinbutton", { name: "Total Amount", exact: true }).nth(1);
  await total.fill("28.00");
  await expect(page.locator("article").nth(1).getByText("Unsaved changes", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export expenses CSV (0)", exact: true })).toBeDisabled();
  await page.waitForTimeout(300);
  await page.reload();
  await expect(page.getByRole("spinbutton", { name: "Total Amount", exact: true }).nth(1)).toHaveValue("28.00");
  await page.locator("article").nth(1).getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByRole("button", { name: "Mark reviewed", exact: true }).nth(1).click();
  const reviewedRow = page.locator("article").nth(1);
  await expect(reviewedRow.getByText("Reviewed", { exact: true })).toBeVisible();
  await expect(reviewedRow.getByRole("heading", { name: "Review Required", exact: true })).toBeHidden();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export expenses CSV (1)", exact: true }).click();
  const file = await download;
  const csv = await readFile((await file.path())!, "utf8");
  expect(csv).toContain('"28.00"');
  expect(csv).toContain('"Sample stationery.png"');
  await expect(page.getByText(/^Extraction confidence low$/i)).toBeVisible();
  await page.getByRole("spinbutton", { name: "Total Amount", exact: true }).nth(1).fill("30.00");
  await page.locator("article").nth(1).getByRole("button", { name: "Discard changes", exact: true }).click();
  await expect(page.getByRole("button", { name: "Export expenses CSV (1)", exact: true })).toBeEnabled();
});

for (const width of [375, 768, 1280]) {
  test(`sample review fits ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: "Try samples" }).click();
    await expect(page.getByRole("textbox", { name: "Merchant Name", exact: true }).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width < 1024) {
      await page.getByRole("button", { name: "Show receipt image", exact: true }).first().click();
      await expect(page.getByAltText("Inline preview of Sample cafe.png")).toBeVisible();
      await page.getByRole("button", { name: "Show form", exact: true }).first().click();
    }
    await page.screenshot({ path: `/tmp/receipt-${width}.png`, fullPage: true });
  });
}

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
  await page.getByRole("button", { name: "Extract 2 files", exact: true }).click();
  await expect(page.getByText("Provider unavailable", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Extract 1 file", exact: true }).click();
  await expect(page.getByText("Provider unavailable", { exact: true })).toHaveCount(0);
  expect(calls).toBe(3);
  await expect(page.getByText("first.png", { exact: true })).toBeVisible();
});
