import {chooseExport} from './support/actions';
import { expect, test, type Page, type Route } from "./support/test";
import { readFile } from "node:fs/promises";
import { expandCurrentReceipt, gotoHome, highConfidenceExtraction, mockExtractionResponse, storedImageCount, uploadReceipts } from "./support/receipt";

async function storedBatch(page: Page) {
  return page.evaluate(() => new Promise<{ schemaVersion: number; items: Array<{ id: string; status: string; formValues: { totalAmount: string } }> }>((resolve, reject) => {
    const open = indexedDB.open("receipt-expenses");
    open.onsuccess = () => {
      const db = open.result;
      const transaction = db.transaction("batches", "readonly");
      const request = transaction.objectStore("batches").get("current");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => db.close();
    };
    open.onerror = () => reject(open.error);
  }));
}

const files = (count: number) => Array.from({ length: count }, (_, index) => ({
  name: `runtime-${index}.png`, mimeType: "image/png", buffer: Buffer.from(`synthetic-${index}`)
}));

const runtimeErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  await gotoHome(page);
});

test.afterEach(async ({ page }, info) => {
  expect(runtimeErrors.get(page)).toEqual([]);
  if (info.status === "passed" && info.title.startsWith("immutable saved notes")) {
    await page.getByLabel("Notes", { exact: true }).first().scrollIntoViewIfNeeded();
    await info.attach("reviewed-expense", { body: await page.screenshot(), contentType: "image/png" });
  }
});

test("immutable saved notes and spreadsheet-safe text round trip through CSV and JSON", async ({ page }) => {
  await page.getByRole("button", { name: "Try samples" }).click();
  await page.getByRole("button",{name:"Deselect Sample stationery.png",exact:true}).click();
  const notes = '=SUM(1,2)\n"Meal", 서울';
  await expect.poll(() => storedImageCount(page)).toBe(2);
  await page.route("**/notes-fixture", route => route.fulfill({contentType:"text/html",body:"<title>Saved notes fixture</title>"}));
  await page.goto("/notes-fixture");
  await page.evaluate(async notes => {
    await new Promise<void>((resolve,reject) => {
      const open=indexedDB.open("receipt-expenses");
      open.onsuccess=()=>{const db=open.result;const tx=db.transaction("batches","readwrite");const store=tx.objectStore("batches");const get=store.get("current");
        get.onsuccess=()=>{const record=get.result;record.items[0].formValues.notes=notes;record.items[0].savedValues.notes=notes;store.put(record,"current");};
        tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
      };open.onerror=()=>reject(open.error);
    });
  },notes);
  await page.goto("/");
  await expect(page.getByRole("textbox", {name:"Notes",exact:true})).toHaveCount(0);
  await expect(page.getByRole("list",{name:"Notes",exact:true}).first().getByRole("listitem")).toHaveText(['=SUM(1,2)', '\"Meal\", 서울']);
  await expect(page.getByRole("list",{name:"Extraction notes",exact:true}).first()).toContainText("Client meeting");
  await page.getByLabel("Merchant Name", { exact: true }).first().fill("@Expense cafe");
  const csvPending = page.waitForEvent("download");
  await chooseExport(page,'CSV');
  const csv = await readFile((await (await csvPending).path())!, "utf8");
  expect(csv).toContain('"\'@Expense cafe"');
  expect(csv).toContain('"\'=SUM(1,2)\n""Meal"", 서울"');
  const jsonPending = page.waitForEvent("download");
  await chooseExport(page,'JSON');
  const records = JSON.parse(await readFile((await (await jsonPending).path())!, "utf8"));
  expect(records).toHaveLength(1);
  expect(records[0].values.notes).toBe(notes);
  expect(records[0].originalExtraction.merchantName).toBe("Sample cafe");
  expect(records[0].originalExtraction.notes).not.toContain(notes);
  expect(csv).toContain(records[0].receiptId);
});

test("receipt preview traps focus and closes with Escape", async ({ page }) => {
  await page.getByRole("button", { name: "Try samples" }).click();
  const trigger = page.getByRole("button", { name: "Preview Sample cafe.png", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Receipt Preview" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Rotate clockwise", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.locator("summary")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Rotate clockwise", exact: true })).toBeFocused();
  await dialog.getByRole("button", { name: "Close preview", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("region", { name: "Receipt image viewer" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Close preview", exact: true })).toBeFocused();
  const image = dialog.getByRole("img");
  const originalTransform = await image.evaluate((element) => getComputedStyle(element).transform);
  await dialog.getByRole("button", { name: "Rotate clockwise", exact: true }).click();
  await expect.poll(() => image.evaluate((element) => getComputedStyle(element).transform)).not.toBe(originalTransform);
  await dialog.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Zoom out", exact: true })).toBeVisible();
  const viewer = dialog.getByRole("region", {name:"Receipt image viewer"});
  await expect.poll(() => viewer.evaluate(el => el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight)).toBe(true);
  await viewer.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => viewer.evaluate(el => el.scrollLeft > 0 || el.scrollTop > 0)).toBe(true);
  await viewer.evaluate(el => el.scrollTo(el.scrollWidth, el.scrollHeight));
  expect(await viewer.evaluate(el => el.scrollLeft > 0 || el.scrollTop > 0)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("refresh interrupts extraction without automatically repeating the provider call", async ({ page }) => {
  let calls = 0;
  let held: Route | undefined;
  await page.route("**/api/extract-receipt", async (route) => {
    calls += 1;
    if (calls === 1) { held = route; return; }
    await route.fulfill({ json: { data: highConfidenceExtraction } });
  });
  await uploadReceipts(page, files(1));
  await page.getByRole("button", { name: "Extract", exact: true }).click();
  await expect.poll(async () => (await storedBatch(page)).items[0]?.status).toBe("extracting");
  await page.reload();
  await held?.abort().catch(() => {});
  await page.getByRole("button", {name:"Expand runtime-0.png",exact:true}).click();
  await expect(page.getByText("Extraction interrupted. Retry when ready.", { exact: true })).toBeVisible();
  expect(calls).toBe(1);
  await page.getByRole("button", { name: "Extract", exact: true }).click();
  await expect(page.locator("article").getByText("Ready",{exact:true})).toBeVisible();
  expect(calls).toBe(2);
});

test("stopping the queue preserves completed receipts and remaining receipts stay retryable", async ({ page }) => {
  let calls = 0;
  let active = 0;
  let maxActive = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/extract-receipt", async (route) => {
    calls += 1;
    active += 1;
    maxActive = Math.max(maxActive, active);
    if (calls <= 2) await gate;
    await route.fulfill({ json: { data: highConfidenceExtraction } });
    active -= 1;
  });
  await uploadReceipts(page, files(3));
  await page.getByRole("button", { name: "Extract", exact: true }).click();
  await expect.poll(() => calls).toBe(2);
  await page.getByRole("button", { name: "Stop remaining receipts", exact: true }).click();
  release();
  await expect(page.getByRole("button", { name: "Extract", exact: true })).toBeEnabled();
  expect(calls).toBe(2);
  await expect(page.locator("article").getByText("Queued", { exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Extract", exact: true }).click();
  await expect(page.locator("article").getByText("Ready",{exact:true})).toHaveCount(3);
  expect(calls).toBe(3);
  expect(maxActive).toBe(2);
});

test("duplicate content is skipped and the five-receipt boundary is enforced", async ({ page }) => {
  const input = page.locator('input[type="file"]').first();
  await input.setInputFiles([files(1)[0], { ...files(1)[0], name: "same-content.png" }]);
  await expect(page.getByText(/identical file skipped/)).toBeVisible();
  await expect(page.locator("article")).toHaveCount(1);
  await page.locator('input[type="file"]').first().setInputFiles(files(5).slice(1));
  await expect(page.locator("article")).toHaveCount(5);
  await expect(page.getByRole("button", { name: "Try samples" })).toBeDisabled();
  await expect(page.getByLabel("Add files")).toBeDisabled();
});

test("pending uploads cannot race sample loading or batch clearing", async ({ page }) => {
  await page.addInitScript(() => {
    const read = FileReader.prototype.readAsDataURL;
    const pending: Array<() => void> = [];
    FileReader.prototype.readAsDataURL = function (blob: Blob) {
      pending.push(() => read.call(this, blob));
    };
    Object.defineProperty(window, "releaseReceiptReads", { value: () => {
      FileReader.prototype.readAsDataURL = read;
      pending.splice(0).forEach((release) => release());
    } });
  });
  await page.reload();
  await expect(page.getByRole("button", { name: "Try samples" })).toBeEnabled();
  await page.getByRole("button", { name: "Try samples" }).click();
  await page.locator('input[type="file"]').first().setInputFiles(files(3));
  expect(await page.getByRole("button", { name: "Try samples" }).isDisabled()).toBe(true);
  expect(await page.getByRole("button", { name: "Clear all saved receipts" }).isDisabled()).toBe(true);
  await page.evaluate(() => (window as unknown as { releaseReceiptReads: () => void }).releaseReceiptReads());
  await expect(page.locator("article")).toHaveCount(5);
  await expect(page.getByRole("button", { name: "Clear all saved receipts" })).toBeEnabled();
  await page.getByRole("button", { name: "Clear all saved receipts" }).click();
  await expect.poll(async () => (await storedBatch(page)).items.length).toBe(0);
  await page.reload();
  await expect(page.getByText("Upload receipts")).toBeVisible();
});

test("unsupported saved schemas are preserved until the user clears them", async ({ page }) => {
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open("receipt-expenses");
    open.onsuccess = () => {
      const db = open.result;
      const transaction = db.transaction("batches", "readwrite");
      transaction.objectStore("batches").put({ schemaVersion: 999, items: [] }, "current");
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error);
    };
  }));
  await page.reload();
  await expect(page.locator('main [role="alert"]')).toContainText("Saved data could not be opened");
  expect((await storedBatch(page)).schemaVersion).toBe(999);
  await page.getByRole("button", { name: "Clear all saved receipts" }).click();
  await expect(page.locator('main [role="alert"]')).toBeHidden();
  await expect.poll(async () => (await storedBatch(page)).schemaVersion).toBe(2);
  await page.reload();
  await expect(page.getByText("Upload receipts")).toBeVisible();
});

test("storage quota errors keep in-memory reviewed values exportable and recover after clearing", async ({ page }) => {
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    localStorage.setItem("runtime-quota", "1");
    IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
      if (localStorage.getItem("runtime-quota") === "1") throw new DOMException("Test quota exhausted", "QuotaExceededError");
      return put.call(this, value, key);
    };
  });
  await page.getByRole("button", { name: "Try samples" }).click();
  await page.getByRole("button",{name:"Deselect Sample stationery.png",exact:true}).click();
  await expect(page.locator('main [role="alert"]')).toContainText("Could not save on this device");
  await expect(page.getByRole("button", { name: "Export", exact: true })).toBeEnabled();
  const pending = page.waitForEvent("download");
  await chooseExport(page,'CSV');
  expect(await readFile((await (await pending).path())!, "utf8")).toContain("12.5");
  await page.evaluate(() => localStorage.removeItem("runtime-quota"));
  await page.getByRole("button", { name: "Clear all saved receipts" }).click();
  await expect(page.locator('main [role="alert"]')).toBeHidden();
  await expect.poll(async () => (await storedBatch(page)).items.length).toBe(0);
});

test("live validation displays actionable fields and enforces currency minor units", async ({ page }) => {
  await mockExtractionResponse(page, { ...highConfidenceExtraction, date: "03/04/2026", currency: "$", totalAmount: 12.5 });
  await uploadReceipts(page, files(1));
  await page.getByRole("button", { name: "Extract", exact: true }).click();
  await expandCurrentReceipt(page, "runtime-0.png");
  await expect(page.getByText("Choose a recognized currency code.", { exact: true })).toBeVisible();
  await page.getByLabel("Date", { exact: true }).fill("2026-11-06");
  await page.getByLabel("Currency", { exact: true }).fill(" jpy ");
  await expect(page.getByText("Too many decimal places for this currency.", { exact: true })).toBeVisible();
  await page.getByLabel("Total Amount", { exact: true }).fill("1250");
  await expect(page.getByRole("button", { name: "Export", exact: true })).toBeEnabled();
  const pending = page.waitForEvent("download");
  await chooseExport(page,'CSV');
  expect(await readFile((await (await pending).path())!, "utf8")).toContain('"JPY"');
});

test("the last receipt remains actionable at 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "Try samples" }).click();
  await expect(page.getByLabel("Total Amount", { exact: true }).last()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("legacy saved receipts migrate atomically with reviewed values and images intact", async ({ page, browserName }) => {
  test.skip(browserName === "webkit", "Legacy File-based records could not be saved in this WebKit runtime.");
  await page.route("**/runtime-legacy-fixture", (route) => route.fulfill({ contentType: "text/html", body: "<title>Legacy storage fixture</title>" }));
  await page.goto("/runtime-legacy-fixture");
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const deletion = indexedDB.deleteDatabase("receipt-expenses");
      deletion.onsuccess = () => resolve();
      deletion.onerror = () => reject(deletion.error);
    });
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open("receipt-expenses", 1);
      open.onupgradeneeded = () => open.result.createObjectStore("batches");
      open.onsuccess = () => {
        const db = open.result;
        const transaction = db.transaction("batches", "readwrite");
        const canvas = document.createElement("canvas");
        canvas.width = 20; canvas.height = 20;
        const bytes = Uint8Array.from(atob(canvas.toDataURL("image/png").split(",")[1]), (character) => character.charCodeAt(0));
        const values = { merchantName: "Legacy corrected cafe", receiptType: "Other", date: "2026-11-06", currency: "MYR", totalAmount: "22.80", notes: "Retained correction" };
        const item = {
          id: "legacy-stable-id", file: new File([bytes], "legacy.png", { type: "image/png" }), previewUrl: "",
          status: "edited", progress: 100, selected: true, expanded: true,
          extraction: { merchantName: "Legacy original", receiptType: "Other", date: "2026-11-06", currency: "MYR", totalAmount: 22.8, confidence: "low", notes: [], items: [] },
          formValues: values, savedValues: values, reviewedAt: new Date().toISOString(), editedAt: Date.now(),
          errors: {}, errorMessage: null, isNewResult: false, resultSeen: true
        };
        transaction.objectStore("batches").put({ schemaVersion: 1, items: [item] }, "current");
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
      open.onerror = () => reject(open.error);
    });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Export", exact: true })).toBeEnabled();
  await expect.poll(async () => (await storedBatch(page)).schemaVersion).toBe(2);
  await page.reload();
  await expect(page.getByRole("button", { name: "Export", exact: true })).toBeEnabled();
  await expect(page.getByLabel("Merchant Name", { exact: true })).toHaveValue("Legacy corrected cafe");
  await expect(page.getByRole("list", { name: "Notes", exact: true })).toContainText("Retained correction");
  await expect.poll(() => page.getByAltText("Inline preview of legacy.png").evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const pending = page.waitForEvent("download");
  await chooseExport(page,'CSV');
  const csv = await readFile((await (await pending).path())!, "utf8");
  expect(csv).toContain("legacy-stable-id");
  expect(csv).toContain('"22.80"');
});


test("deleting receipts and clearing the batch remove stored source images", async ({ page }) => {
  await page.getByRole("button", { name: "Try samples" }).click();
  await expect.poll(() => storedImageCount(page)).toBe(2);
  await page.getByRole("button", { name: "Delete Sample cafe.png", exact: true }).click();
  await expect.poll(() => storedImageCount(page)).toBe(1);
  await page.getByRole("button", { name: "Clear all saved receipts" }).click();
  await expect.poll(() => storedImageCount(page)).toBe(0);
  await page.reload();
  await expect(page.getByText("Upload receipts")).toBeVisible();
});
