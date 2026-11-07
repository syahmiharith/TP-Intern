import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createGeneratedReceiptPng, gotoHome } from "./support/receipt";

test("real PNG JPEG and WebP receipts complete one reviewed expense batch", async ({ page, browserName }, info) => {
  test.skip(process.env.RUN_LIVE_GEMINI_E2E !== "1", "Enable live-provider verification explicitly.");
  test.skip(browserName !== "chromium", "The real format matrix runs once to conserve provider quota.");
  test.setTimeout(180000);
  await gotoHome(page);
  const png = await createGeneratedReceiptPng(page);
  const encoded = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width; canvas.height = image.height;
    canvas.getContext("2d")!.drawImage(image, 0, 0);
    return [canvas.toDataURL("image/jpeg", 0.92), canvas.toDataURL("image/webp", 0.92)];
  }, png.buffer.toString("base64"));
  expect(encoded[0]).toMatch(/^data:image\/jpeg;/);
  expect(encoded[1]).toMatch(/^data:image\/webp;/);
  const files = [
    { ...png, name: "synthetic.png" },
    { name: "synthetic.jpg", mimeType: "image/jpeg", buffer: Buffer.from(encoded[0].split(",")[1], "base64") },
    { name: "synthetic.webp", mimeType: "image/webp", buffer: Buffer.from(encoded[1].split(",")[1], "base64") }
  ];
  await page.locator('input[type="file"]').first().setInputFiles(files);
  await page.getByRole("button", { name: "Extract 3 files", exact: true }).click();
  await expect(page.getByText("3 of 3 processed", { exact: true })).toBeVisible({ timeout: 150000 });
  await expect(page.locator("article").getByText("Ready", { exact: true })).toHaveCount(3);
  for (const file of files) {
    const row = page.locator("article").filter({ has: page.getByText(file.name, { exact: true }) });
    await row.getByRole("button", { name: `Expand ${file.name}`, exact: true }).click();
    expect(Number(await row.getByLabel("Total Amount", { exact: true }).inputValue())).toBeGreaterThan(0);
    await row.getByLabel("Merchant Name", { exact: true }).fill("Sample Receipt Mart");
    await row.getByLabel("Currency", { exact: true }).fill("MYR");
    await row.getByLabel("Date", { exact: true }).fill("2026-05-11");
    await row.getByLabel("Total Amount", { exact: true }).fill("22.80");
  }
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export expenses CSV (3)", exact: true }).click();
  const csv = await readFile((await (await pending).path())!, "utf8");
  for (const file of files) expect(csv).toContain(`"${file.name}"`);
  expect(csv.match(/"22\.80"/g)).toHaveLength(3);
  await info.attach("verified-expenses.csv", { body: csv, contentType: "text/csv" });
});
