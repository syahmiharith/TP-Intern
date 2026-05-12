import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";

function createImageFile(name = "receipt.png") {
  return new File(["fake image content"], name, { type: "image/png" });
}

function uploadFile(file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement | null;
  if (!input) throw new Error("File input was not found");
  fireEvent.change(input, { target: { files: [file] } });
}

describe("Home page", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders the assessment flow", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { name: /receipt-to-form auto-fill web app/i })).toBeInTheDocument();
    expect(screen.getByText(/click to upload receipt/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /extract data with ai/i })).toBeDisabled();
    expect(screen.getByRole("heading", { name: /review auto-filled form/i })).toBeInTheDocument();
  });

  it("rejects unsupported file types before calling the API", () => {
    render(<Home />);

    uploadFile(new File(["hello"], "notes.txt", { type: "text/plain" }));

    expect(screen.getByText(/please upload a jpg, png, or webp receipt image/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /extract data with ai/i })).toBeDisabled();
  });

  it("shows the uploaded file and enables extraction for a valid image", () => {
    render(<Home />);

    uploadFile(createImageFile("sample-receipt.png"));

    expect(screen.getByText("sample-receipt.png")).toBeInTheDocument();
    expect(screen.getByAltText("Receipt preview")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /extract data with ai/i })).toBeEnabled();
  });

  it("auto-fills the form after successful AI extraction", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          data: {
            merchantName: "FamilyMart",
            date: "2026-05-11",
            totalAmount: 12000,
            currency: "KRW",
            confidence: "high",
            notes: ["Clear receipt image."]
          }
        })
      }))
    );

    render(<Home />);
    uploadFile(createImageFile());

    fireEvent.click(screen.getByRole("button", { name: /extract data with ai/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/merchant name/i)).toHaveValue("FamilyMart");
    });

    expect(screen.getByLabelText(/date/i)).toHaveValue("2026-05-11");
    expect(screen.getByLabelText(/total amount/i)).toHaveValue(12000);
    expect(screen.getByLabelText(/currency/i)).toHaveValue("KRW");
    expect(screen.getByText(/high confidence/i)).toBeInTheDocument();
    expect(screen.getAllByText(/clear receipt image/i).length).toBeGreaterThan(0);
  });

  it("shows an error when extraction fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        json: async () => ({ error: "Gemini extraction failed." })
      }))
    );

    render(<Home />);
    uploadFile(createImageFile());

    fireEvent.click(screen.getByRole("button", { name: /extract data with ai/i }));

    expect(await screen.findByText("Gemini extraction failed.")).toBeInTheDocument();
  });

  it("validates required fields before submission", () => {
    render(<Home />);

    fireEvent.change(screen.getByLabelText(/merchant name/i), { target: { value: "Only Merchant" } });
    fireEvent.click(screen.getByRole("button", { name: /submit extracted data/i }));

    expect(screen.getByText("Date is required.")).toBeInTheDocument();
    expect(screen.getByText("Total amount must be a number greater than 0.")).toBeInTheDocument();
    expect(screen.getByText("Currency is required.")).toBeInTheDocument();
  });

  it("allows manual edits and saves submitted JSON locally", () => {
    render(<Home />);

    fireEvent.change(screen.getByLabelText(/merchant name/i), { target: { value: "Manual Cafe" } });
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: "2026-05-11" } });
    fireEvent.change(screen.getByLabelText(/total amount/i), { target: { value: "15.50" } });
    fireEvent.change(screen.getByLabelText(/currency/i), { target: { value: "myr" } });
    fireEvent.change(screen.getByLabelText(/notes/i), { target: { value: "Corrected manually." } });

    fireEvent.click(screen.getByRole("button", { name: /submit extracted data/i }));

    expect(screen.getByText(/submission saved locally/i)).toBeInTheDocument();
    expect(screen.getByText(/Manual Cafe/)).toBeInTheDocument();
    expect(screen.getByText(/MYR/)).toBeInTheDocument();

    expect(JSON.parse(window.localStorage.getItem("latestReceiptSubmission") ?? "{}")).toEqual({
      merchantName: "Manual Cafe",
      date: "2026-05-11",
      totalAmount: "15.50",
      currency: "MYR",
      notes: "Corrected manually."
    });
  });
});
