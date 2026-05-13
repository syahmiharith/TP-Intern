import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";

function createImageFile(name = "receipt.png") {
  return new File(["fake image content"], name, { type: "image/png" });
}

function uploadFiles(files: File[]) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement | null;
  if (!input) throw new Error("File input was not found");
  fireEvent.change(input, { target: { files } });
}

const completeExtraction = {
  merchantName: "AEON Wellness",
  receiptType: "Groceries",
  date: "2026-05-12",
  totalAmount: 43.8,
  currency: "MYR",
  confidence: "high",
  notes: ["No major uncertainty detected."],
  items: [{ name: "Gardenia Bread", quantity: 1, value: 3.8 }]
};

const partialExtraction = {
  merchantName: null,
  receiptType: "Retail",
  date: null,
  totalAmount: null,
  currency: "MYR",
  confidence: "low",
  notes: ["Receipt image is blurry."],
  items: [{ name: "Item text unclear", quantity: null, value: null }]
};

describe("Home page receipt queue", () => {
  beforeEach(() => {
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:receipt-preview"),
      revokeObjectURL: vi.fn()
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("starts with only the upload area", () => {
    render(<Home />);

    expect(screen.getByText("Upload receipt files")).toBeInTheDocument();
    expect(screen.getByText(/JPG, PNG, WEBP/i)).toBeInTheDocument();
    expect(screen.getByText("AI Receipt-to-Form Auto-Fill")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Human-reviewed AI receipt extraction/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Extract/i })).not.toBeInTheDocument();
  });

  it("rejects unsupported file types before adding queue items", () => {
    render(<Home />);

    uploadFiles([new File(["hello"], "notes.txt", { type: "text/plain" })]);

    expect(screen.getByText(/unsupported file type/i)).toBeInTheDocument();
    expect(screen.queryByText("notes.txt")).not.toBeInTheDocument();
  });

  it("adds valid uploads as selected queue items with footer extraction", () => {
    render(<Home />);

    uploadFiles([createImageFile("receipt-1.png"), createImageFile("receipt-2.png")]);

    expect(screen.getByRole("heading", { name: /Human-reviewed AI receipt extraction/i })).toBeInTheDocument();
    expect(screen.getByText("receipt-1.png")).toBeInTheDocument();
    expect(screen.getByText("receipt-2.png")).toBeInTheDocument();
    expect(screen.getByText(/2 selected/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Extract 2 files" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Extract receipt-1.png/i })).not.toBeInTheDocument();
  });

  it("deletes an item and frees an upload slot", () => {
    render(<Home />);

    uploadFiles([createImageFile("receipt-1.png"), createImageFile("receipt-2.png")]);
    fireEvent.click(screen.getByRole("button", { name: /Delete receipt-1.png/i }));

    expect(screen.queryByText("receipt-1.png")).not.toBeInTheDocument();
    expect(screen.getByText(/1 selected/i)).toBeInTheDocument();
    expect(screen.queryByText(/1 \/ 5 files/i)).not.toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:receipt-preview");
  });

  it("extracts one ready item and shows complete summary plus download", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ data: completeExtraction })
      }))
    );

    render(<Home />);
    uploadFiles([createImageFile("aeon-receipt.png")]);

    fireEvent.click(screen.getByRole("button", { name: /Extract 1 file/i }));

    await waitFor(() => {
      expect(screen.getByText(/Extracted · high/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/AEON Wellness · MYR 43.80 · 2026-05-12/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Download result for aeon-receipt.png/i })).toBeInTheDocument();
  });

  it("marks partial low-confidence extraction as needs review until manually fixed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ data: partialExtraction })
      }))
    );

    render(<Home />);
    uploadFiles([createImageFile("blurry-receipt.png")]);

    fireEvent.click(screen.getByRole("button", { name: /Extract 1 file/i }));
    expect(await screen.findByText(/Needs review/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Download result/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Expand blurry-receipt.png/i }));
    expect(screen.getByText("Merchant name is required.")).toBeInTheDocument();
    expect(screen.getByText("Date is required.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Merchant Name"), { target: { value: "AEON Wellness" } });
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-05-12" } });
    fireEvent.change(screen.getByLabelText("Total Amount"), { target: { value: "43.80" } });
    fireEvent.click(screen.getByRole("button", { name: /Save changes/i }));

    expect(screen.getByText(/Edited/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Download result for blurry-receipt.png/i })).toBeInTheDocument();
  });

  it("opens the preview modal from the row icon", () => {
    render(<Home />);
    uploadFiles([createImageFile("receipt-preview.png")]);

    fireEvent.click(screen.getByRole("button", { name: /Preview receipt-preview.png/i }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Receipt Preview")).toBeInTheDocument();
    expect(screen.getByAltText(/Preview of receipt-preview.png/i)).toBeInTheDocument();
  });
});
