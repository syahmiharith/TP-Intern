import { expect, test } from "@playwright/test";
import { gotoHome, uploadReceipts } from "./support/receipt";

test.describe("receipt queue item controls", () => {
  test("opens and closes receipt preview modal", async ({ page }) => {
    await gotoHome(page);
    await uploadReceipts(page, [{ name: "preview-receipt.png", mimeType: "image/png", buffer: Buffer.from("preview") }]);

    await page.getByRole("button", { name: /Preview preview-receipt.png/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText("Receipt Preview")).toBeVisible();

    await page.getByRole("button", { name: /Close preview/i }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("delete removes item and updates counts", async ({ page }) => {
    await gotoHome(page);
    await uploadReceipts(page, [
      { name: "first-receipt.png", mimeType: "image/png", buffer: Buffer.from("first") },
      { name: "second-receipt.png", mimeType: "image/png", buffer: Buffer.from("second") }
    ]);

    await page.getByRole("button", { name: /Delete first-receipt.png/i }).click();

    await expect(page.getByText("first-receipt.png")).toBeHidden();
    await expect(page.getByText("second-receipt.png")).toBeVisible();
    await expect(page.getByText(/1 selected/i)).toBeVisible();
    await expect(page.getByText(/1 \/ 5 files/i)).toBeHidden();
    await expect(page.getByText("Receipt removed.")).toBeVisible();
  });

  test("select all and deselect all update extract availability", async ({ page }) => {
    await gotoHome(page);
    await uploadReceipts(page, [
      { name: "first-receipt.png", mimeType: "image/png", buffer: Buffer.from("first") },
      { name: "second-receipt.png", mimeType: "image/png", buffer: Buffer.from("second") }
    ]);

    await page.getByRole("button", { name: /Deselect all/i }).click();
    await expect(page.getByText(/0 selected/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Extract$/i })).toBeDisabled();

    await page.getByRole("button", { name: /Select all/i }).click();
    await expect(page.getByText(/2 selected/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Extract 2 files/i })).toBeEnabled();
  });
});
