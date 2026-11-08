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
