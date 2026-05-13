import { expect, test } from "@playwright/test";
import { acceptedReceiptFiles, expectReceiptQueued, gotoHome, uploadReceipt, uploadReceipts } from "./support/receipt";

test.describe("receipt upload boundaries", () => {
  test("starts with only the upload area", async ({ page }) => {
    await gotoHome(page);

    await expect(page.getByText("Upload receipt files")).toBeVisible();
    await expect(page.getByText(/5MB per file/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: /AI receipt extraction queue/i })).toBeHidden();
  });

  for (const file of acceptedReceiptFiles) {
    test(`accepts ${file.mimeType} uploads`, async ({ page }) => {
      await gotoHome(page);
      await uploadReceipt(page, file);

      await expectReceiptQueued(page, file.name);
      await expect(page.getByRole("button", { name: new RegExp(`Preview ${file.name}`, "i") })).toBeVisible();
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
    await expect(page.getByRole("heading", { name: /AI receipt extraction queue/i })).toBeHidden();
  });

  test("rejects images larger than 5MB before extraction", async ({ page }) => {
    await gotoHome(page);

    await uploadReceipt(page, {
      name: "large-receipt.png",
      mimeType: "image/png",
      buffer: Buffer.alloc(5 * 1024 * 1024 + 1)
    });

    await expect(page.getByText(/larger than 5MB/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: /AI receipt extraction queue/i })).toBeHidden();
  });

  test("limits the queue to five files", async ({ page }) => {
    await gotoHome(page);
    await uploadReceipts(
      page,
      Array.from({ length: 5 }, (_, index) => ({
        name: `receipt-${index + 1}.png`,
        mimeType: "image/png",
        buffer: Buffer.from(`receipt-${index + 1}`)
      }))
    );

    await expect(page.getByText(/5 \/ 5 files/i).first()).toBeVisible();
    await expect(page.getByLabel("Add files")).toBeDisabled();
  });
});
