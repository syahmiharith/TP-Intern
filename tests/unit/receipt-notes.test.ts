import { describe, expect, it } from "vitest";
import { receiptDisplayNotes } from "@/lib/receipt-notes";

describe("receipt note presentation", () => {
  it("deduplicates repeated lines and multi-line source notes across both lists", () => {
    expect(receiptDisplayNotes("Tax included.\nCheck the date.\n tax  included ", ["Tax included.\nCheck the date.", "• TAX INCLUDED.", "Keep the receipt.", "Keep the receipt."]))
      .toEqual({ notes: ["Tax included.", "Check the date."], originalNotes: ["Keep the receipt."] });
  });
  it("preserves differences in numbers, wording and certainty", () => {
    const notes = ["Total 20.00.", "Total 200.00.", "Tax included?", "Tax included.", "Tax not included."];
    expect(receiptDisplayNotes(notes.join("\n"), notes).notes).toEqual(notes);
  });
  it("does not mutate original notes or source text", () => {
    const original = Object.freeze(["Tax included.\nTax included.", "TAX INCLUDED"]);
    const current = original.join("\n");
    expect(receiptDisplayNotes(current, original)).toEqual({notes:["Tax included."], originalNotes:[]});
    expect(original).toEqual(["Tax included.\nTax included.", "TAX INCLUDED"]);
  });
});

describe("contextual extraction notes", () => {
  const formNotes = [
    "Image is a web form, not a traditional receipt.",
    "Currency and total amount are not applicable as no transaction is present.",
    "Date is not visible on the form.",
    "Date could not be confidently extracted. Please enter it manually.",
    "Total amount could not be confidently extracted. Please enter it manually.",
    "Currency could not be confidently extracted. Please enter it manually."
  ];
  it("consolidates the non-transaction example into its useful cause", () => {
    expect(receiptDisplayNotes(formNotes.join("\n"), formNotes)).toEqual({notes:["No transaction found in this web form."],originalNotes:[]});
  });
  it("omits stock field prompts and retains the specific receipt finding", () => {
    expect(receiptDisplayNotes("Date is not visible.\nDate could not be confidently extracted. Please enter it manually.",[]))
      .toEqual({notes:["Date is not visible."],originalNotes:[]});
  });
  it("does not confuse a missing transaction ID with a missing transaction", () => {
    const notes=["No transaction ID found.","Date is not visible on the receipt."];
    expect(receiptDisplayNotes(notes.join("\n"),[]).notes).toEqual(notes);
  });
  it("retains distinct amounts, questions and unrelated findings", () => {
    const extras=["Total 20.00 needs checking.","Tax included?","The image is cropped on the right."];
    expect(receiptDisplayNotes([...formNotes,...extras].join("\n"),formNotes).notes)
      .toEqual(["No transaction found in this web form.",...extras]);
  });
  it("does not create an empty placeholder note when only field prompts exist", () => {
    expect(receiptDisplayNotes(formNotes.slice(3).join("\n"),formNotes.slice(3))).toEqual({notes:[],originalNotes:[]});
  });
});
