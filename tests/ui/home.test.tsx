import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";
import { readBatch } from "@/lib/expense-workflow";

vi.mock("@/lib/expense-workflow", async (importOriginal) => ({ ...await importOriginal<object>(), readBatch: vi.fn(async () => []), writeBatch: vi.fn(async () => {}) }));

function createImageFile(name = "receipt.png") {
  return new File([name], name, { type: "image/png" });
}

async function uploadFiles(files: File[]) {
  await waitFor(() => expect(screen.getByRole("button", { name: "Try samples" })).toBeEnabled());
  const input = document.querySelector('input[type="file"]') as HTMLInputElement | null;
  if (!input) throw new Error("File input was not found");
  await act(async () => { fireEvent.change(input, { target: { files } }); });
  if (files[0]?.type === "image/png") await screen.findByText(files[0].name);
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
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:receipt-preview"),
      revokeObjectURL: vi.fn()
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps entry controls disabled until saved receipts are loaded", async () => {
    let finishLoading!: (value: []) => void;
    vi.mocked(readBatch).mockReturnValueOnce(new Promise<[]>((resolve) => { finishLoading = resolve; }));
    render(<Home />);
    expect(screen.getByText("Loading saved receipts…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try samples" })).toBeDisabled();
    expect(screen.getByLabelText(/Upload receipts/)).toBeDisabled();
    await act(async () => finishLoading([]));
    expect(screen.queryByText("Loading saved receipts…")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try samples" })).toBeEnabled();
  });

  it("starts with only the upload area", async () => {
    render(<Home />);

    expect(screen.getByText("Upload receipts")).toBeInTheDocument();
    expect(screen.getByText(/JPG, PNG, WEBP or ZIP/i)).toBeInTheDocument();
    expect(screen.getByText("Receipt-to-Form")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Receipts in. Expenses ready./i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Extract/i })).not.toBeInTheDocument();
  });

  it("rejects unsupported file types before adding queue items", async () => {
    render(<Home />);

    await uploadFiles([new File(["hello"], "notes.txt", { type: "text/plain" })]);

    expect(await screen.findByText(/unsupported file type/i)).toBeInTheDocument();
    expect(screen.queryByText("notes.txt")).not.toBeInTheDocument();
  });

  it("adds valid uploads as selected queue items with footer extraction", async () => {
    render(<Home />);

    await uploadFiles([createImageFile("receipt-1.png"), createImageFile("receipt-2.png")]);

    expect(screen.getByRole("heading", { name: /Receipts in. Expenses ready./i })).toBeInTheDocument();
    expect(screen.getByText("receipt-1.png")).toBeInTheDocument();
    expect(screen.getByText("receipt-2.png")).toBeInTheDocument();
    expect(screen.getByText(/2 selected/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Extract" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Extract receipt-1.png/i })).not.toBeInTheDocument();
  });

  it("deletes an item and frees an upload slot", async () => {
    render(<Home />);

    await uploadFiles([createImageFile("receipt-1.png"), createImageFile("receipt-2.png")]);
    fireEvent.click(screen.getByRole("button", { name: /Delete receipt-1.png/i }));

    expect(screen.queryByText("receipt-1.png")).not.toBeInTheDocument();
    expect(screen.getByText(/1 selected/i)).toBeInTheDocument();
    expect(screen.queryByText(/1 \/ 5 files/i)).not.toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:receipt-preview");
  });

  it("exports a valid extraction directly without a review step", async () => {
    vi.stubGlobal("fetch",vi.fn(async()=>({ok:true,json:async()=>({authorized:true,data:completeExtraction})})));
    render(<Home />); await uploadFiles([createImageFile("aeon-receipt.png")]);
    fireEvent.click(screen.getByRole("button",{name:"Extract"}));
    await screen.findByText("Ready");
    expect(screen.getByRole("button",{name:"Export"})).toBeEnabled();
    expect(screen.queryByRole("button",{name:"Mark reviewed"})).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Merchant Name")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Expand aeon-receipt.png"}));
    expect(screen.getByLabelText("Merchant Name")).toHaveValue("AEON Wellness");
    expect(screen.getByLabelText("Item 1 price")).toHaveValue("3.8");
  });

  it("preserves three-decimal totals in the live editor", async()=>{
    vi.stubGlobal("fetch",vi.fn(async()=>({ok:true,json:async()=>({authorized:true,data:{...completeExtraction,currency:"KWD",totalAmount:1.234}})})));
    render(<Home/>);await uploadFiles([createImageFile("precision.png")]);fireEvent.click(screen.getByRole("button",{name:"Extract"}));
    await screen.findByText("Ready");fireEvent.click(screen.getByRole("button",{name:"Expand precision.png"}));
    expect(screen.getByLabelText("Total Amount")).toHaveValue("1.234");
    expect(screen.getByRole("button",{name:"Export"})).toBeEnabled();
  });

  it("updates validation and export eligibility while typing",async()=>{
    vi.stubGlobal("fetch",vi.fn(async()=>({ok:true,json:async()=>({authorized:true,data:partialExtraction})})));
    render(<Home/>);await uploadFiles([createImageFile("blurry-receipt.png")]);fireEvent.click(screen.getByRole("button",{name:"Extract"}));
    await screen.findByText("Needs attention");fireEvent.click(screen.getByRole("button",{name:"Expand blurry-receipt.png"}));
    expect(screen.getByText("Merchant name is required.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Merchant Name"),{target:{value:"AEON Wellness"}});
    fireEvent.change(screen.getByLabelText("Date"),{target:{value:"2026-05-12"}});
    fireEvent.change(screen.getByLabelText("Total Amount"),{target:{value:"43.80"}});
    expect(screen.getByRole("button",{name:"Export"})).toBeEnabled();
    expect(screen.queryByRole("button",{name:/Save changes|Mark reviewed|Discard changes/})).not.toBeInTheDocument();
  });

  it("opens the preview modal from the row icon", async () => {
    render(<Home />);
    await uploadFiles([createImageFile("receipt-preview.png")]);

    fireEvent.click(screen.getByRole("button", { name: /Preview receipt-preview.png/i }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Receipt Preview")).toBeInTheDocument();
    expect(screen.getByAltText(/Preview of receipt-preview.png/i)).toBeInTheDocument();
  });
});
