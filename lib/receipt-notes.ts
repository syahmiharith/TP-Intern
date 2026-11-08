/** Deduplicate presentation only; saved text and original extraction remain intact. */
export function receiptDisplayNotes(current: string, original: readonly string[]) {
  const seen = new Set<string>();
  function unique(lines: readonly string[]) {
    return lines.flatMap(line => line.split(/\r?\n/)).flatMap(line => {
      const note = line.trim().replace(/^[-*•]\s+/, "").trim();
      if (!note) return [];
      const key = note.normalize("NFKC").replace(/\s+/g, " ").replace(/\.+$/, "").toLowerCase();
      if (seen.has(key)) return [];
      seen.add(key);
      return [note];
    });
  }
  const notes = unique([current]);
  const originalNotes = unique(original);
  return { notes, originalNotes };
}
