/** Present useful findings once; saved text and original extraction remain intact. */
function noteKey(note: string) {
  return note.normalize("NFKC").replace(/\s+/g, " ").replace(/\.+$/, "").toLowerCase();
}

// These exact normalizer messages repeat validation already shown beside fields.
function isFieldPrompt(note: string) {
  const key = noteKey(note);
  return /^(merchant name|date|total amount|currency) could not be confidently extracted\. please enter it manually$/.test(key)
    || key === "receipt type could not be confidently classified. please select it manually";
}

function hasNoTransaction(note: string) {
  return /\bno transaction\s+(?:(?:is|was)\s+)?(?:present|visible|found|shown)\b/i.test(note);
}

function isNonTransactionDetail(note: string) {
  // Keep amounts, dates and questions rather than treating them as boilerplate.
  if (/\d|[?!]/.test(note)) return false;
  const key = noteKey(note);
  return /\bnot (?:a |an )?(?:(?:traditional|valid) )?receipt\b/.test(key)
    || /^(?:currency|total amount|currency and total amount)\b.*\b(?:not applicable|do not apply|does not apply)\b/.test(key)
    || /^date\b.*\b(?:not visible|not shown|not present|missing)\b/.test(key)
    || /^(?:there (?:is|was) )?no transaction\b/.test(key);
}

export function receiptDisplayNotes(current: string, original: readonly string[]) {
  const seen = new Set<string>();
  function unique(lines: readonly string[]) {
    return lines.flatMap(line => line.split(/\r?\n/)).flatMap(line => {
      const note = line.trim().replace(/^[-*•]\s+/, "").trim();
      if (!note || isFieldPrompt(note)) return [];
      const key = noteKey(note);
      if (seen.has(key)) return [];
      seen.add(key);
      return [note];
    });
  }
  const notes = unique([current]);
  const originalNotes = unique(original);
  const all = [...notes, ...originalNotes];
  if (!all.some(hasNoTransaction)) return { notes, originalNotes };

  const webForm = all.some(note => /\bweb[ -]?form\b/i.test(note)
    && /\bnot (?:a |an )?(?:(?:traditional|valid) )?receipt\b/i.test(note));
  const summary = webForm ? "No transaction found in this web form." : "No transaction found in this image.";
  const remainingNotes = notes.filter(note => !isNonTransactionDetail(note));
  const remainingOriginal = originalNotes.filter(note => !isNonTransactionDetail(note));
  // Keep findings with their source list when older saved notes differ from extraction.
  if (notes.some(hasNoTransaction)) remainingNotes.unshift(summary);
  else remainingOriginal.unshift(summary);
  return { notes: remainingNotes, originalNotes: remainingOriginal };
}
