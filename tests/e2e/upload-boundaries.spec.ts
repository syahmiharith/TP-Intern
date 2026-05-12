import { expect, test } from "@playwright/test";
import {
  acceptedReceiptFiles,
  defaultReceiptFile,
  expectReceiptPreview,
  extractButton,
  gotoHome,
  merchantNameInput,
  typeTextInput,
  uploadReceipt
} from "./support/receipt";

test.describe("receipt upload boundaries", () => {
  test("starts with extraction disabled until a valid image is uploaded", async ({ page }) => {
    await gotoHome(page);

    await expect(page.getByText(/drop your receipt here or click to upload/i)).toBeVisible();
    await expect(page.getByText(/upload a receipt and run extraction/i)).toBeVisible();
    await expect(extractButton(page)).toBeDisabled();
  });

  for (const file of acceptedReceiptFiles) {
    test(`accepts ${file.mimeType} uploads`, async ({ page }) => {
      await gotoHome(page);
      await uploadReceipt(page, file);

      await expectReceiptPreview(page, file.name);
    });
  }

  test("rejects unsupported file types before extraction", async ({ page }) => {
    await gotoHome(page);

    await uploadReceipt(page, {
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("not an image")
    });

    await expect(page.getByText(/unsupported file type/i)).toBeVisible();
    await expect(page.getByText("notes.txt")).toBeHidden();
    await expect(page.getByAltText("Receipt preview")).toBeHidden();
    await expect(extractButton(page)).toBeDisabled();
  });

  test("rejects images larger than 5MB before extraction", async ({ page }) => {
    await gotoHome(page);

    await uploadReceipt(page, {
      name: "large-receipt.png",
      mimeType: "image/png",
      buffer: Buffer.alloc(5 * 1024 * 1024 + 1)
    });

    await expect(page.getByText(/file is too large/i)).toBeVisible();
    await expect(page.getByText("large-receipt.png")).toBeHidden();
    await expect(page.getByAltText("Receipt preview")).toBeHidden();
    await expect(extractButton(page)).toBeDisabled();
  });

  test("replacing a receipt clears old extracted form data", async ({ page }) => {
    await gotoHome(page);
    await uploadReceipt(page, defaultReceiptFile);
    await typeTextInput(merchantNameInput(page), "Old Merchant");

    await uploadReceipt(page, {
      name: "replacement-receipt.png",
      mimeType: "image/png",
      buffer: Buffer.from("replacement image content")
    });

    await expectReceiptPreview(page, "replacement-receipt.png");
    await expect(merchantNameInput(page)).toHaveValue("");
  });
});
