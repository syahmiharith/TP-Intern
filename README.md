# Receipt-to-Form

Turn receipt images into editable expenses and line items. Check the extracted fields beside the original image, correct them and export the current values.

[Try demo](https://receipt-to-form-syahmiharith.vercel.app/) · [Case study](https://zsyahmi.dev/work/receipt-to-form) · [Release checks](docs/REVIEW_GUIDE.md)

## Try a receipt

1. Choose the public samples, or upload up to five JPG, PNG or WebP images. ZIP import lets you select images before adding them.
2. Extract uploaded receipts with a private pilot code. Samples need no code or provider call.
3. Expand a row to inspect the image and edit expense fields or line items. Corrections save automatically.
4. Select valid receipts and choose **Export → CSV**. JSON also preserves the original extraction separately.

Invalid fields exclude the affected receipt until corrected. There is no approval gate or manual Save step.

## Decisions in the implementation

**The source stays beside the draft.** Image zoom, rotation and panning support checking uncertain fields without leaving the editor. Missing amounts remain blank rather than being guessed.

**Export follows the edited record.** CSV uses current valid values and line items. JSON keeps those values separate from original extraction and confidence, so a human correction does not rewrite model provenance.

**Recovery is part of the workflow.** Receipts, images and corrections persist in IndexedDB on the current device. Failed extractions can be retried without replacing successful results or edits.

Gemini handles visual extraction through one server-side API route. Application code validates files and provider output, manages the queue and writes exports. The stack is Next.js, React, TypeScript, Zod and IndexedDB.

## Maintenance evidence

The [Zod 4 upgrade](https://github.com/syahmiharith/receipt-to-form/commit/556d3d93ad4be6bb8a889adfc025afa6310c8240) includes regression cases for missing, nullable and malformed provider values. [API tests](tests/api/extract-receipt.test.ts) check the extraction contract; [workflow tests](tests/e2e/expense-workflow.spec.ts) cover corrections and exports.

[Runtime recovery checks](tests/e2e/runtime-verification.spec.ts) exercise interrupted work and browser-storage failures. Saved-record schema 2 separates image bytes from metadata for WebKit compatibility while preserving existing corrections during migration.

## Run locally

Requires Node.js 20.19 or later and npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. Samples work without a provider call. Live extraction needs server-side Gemini credentials, shared Redis limits and pilot access configuration; see [operations and recovery](docs/operations.md) and [pilot security](docs/SECURITY.md). Never put API keys in browser code.

## Check a change

```bash
npm run ci
npm run test:e2e
```

The default tests mock extraction for deterministic checks without spending provider quota. Run `npm run test:e2e:live` separately for the real provider path, using synthetic receipts. Mocked tests do not establish extraction accuracy.

[Testing guide](TESTING.md) · [Release checks](docs/REVIEW_GUIDE.md) · [Demo walkthrough](docs/DEMO_SCRIPT.md) · [API and operations](docs/operations.md)

## Scope and origin

PDFs and cross-device synchronization are outside the current scope. Data stays on the current device, expires seven days after the last edit and can be evicted by the browser. Live extraction is invite-only and depends on provider availability.

Originally developed as a recruitment assessment, the project retains its development history and MIT license. Unfamiliar-user completion and return-use evidence is still pending; no adoption or time-saving results are claimed.
