# Receipt-to-Form

> Designed, built and maintained by [Zulsyahmi Zulkefli](https://portfolio-syahmiharith.vercel.app). [Product case study](https://portfolio-syahmiharith.vercel.app/work/receipt-to-form) · [Release checks](docs/REVIEW_GUIDE.md) · [Demo script](docs/DEMO_SCRIPT.md). Older review-gate release notes below are historical.


Receipt-to-Form turns receipt images into editable expenses and line items. Corrections save automatically, and valid selected receipts export directly as CSV with secondary provenance JSON.

**Run the app:** follow [Getting Started](#getting-started).

**Live demo:** <https://receipt-to-form-syahmiharith.vercel.app/>

**Walkthrough:** [Demo Script](./docs/DEMO_SCRIPT.md). The earlier recording is retained in Git history, not presented as a current UI demonstration.

**Setup shortcuts:** [Getting Started](#getting-started) · [Deployment](#deployment)

**Reviewer docs:** [Testing Guide](./TESTING.md) · [Review Guide](./docs/REVIEW_GUIDE.md) · [Demo Script](./docs/DEMO_SCRIPT.md)

## Quick Path

1. Upload one to five JPG, PNG or WebP receipts, select images from a ZIP, or choose the optional samples.
2. Extract uploaded receipts and compare each result with its image. If a request fails, **Extract** retries selected failed receipts without re-extracting successful results or replacing their corrections.
3. Expand a row to correct fields and edit item names, quantities and prices. Changes save automatically; no approval or manual Save action is required.
4. Use **Export → CSV** in the batch toolbar for valid selected receipts and current line items. **Export → JSON** retains original provenance.
5. Invalid fields exclude a receipt until corrected. Refresh restores current corrections and line items. Model confidence remains unchanged and never gates export.

The branded address above is the main entry. The older tp-intern-malaysia address keeps a recovery workflow for existing saved receipts; finish and export there before clearing them and continuing to the main app.

## Product decisions

I designed the workflow around one useful outcome: expense records that match the values on screen. Import, extraction, corrections, recovery and export stay in the same workspace.

Key product decisions:

- AI creates the first draft; the user remains responsible for uncertain or incomplete fields.
- Batch queue UX supports up to five receipts with up to two extractions running concurrently.
- Export uses current valid fields and line items, without an approval gate.
- The backend stays small: one secure `POST /api/extract-receipt` route handles validation, rate limiting, and Gemini calls.

## What I Built

- Upload queue for up to five receipt images.
- Supported images: JPG, PNG, WEBP, max 5MB each. ZIP import opens locally and lists entries for selection before adding images to the same queue. A ZIP selection may contain up to 25MB and 200 entries. Unsupported files are listed but unavailable; folders and system metadata are omitted. Nested archives are not opened. Only selected images are decompressed, checked against the image size limit, and added; extraction remains a separate action.
- Auto-selection for newly uploaded files.
- Preview modal for every uploaded receipt.
- Selected-file extraction with at most two concurrent API calls. Stop queue finishes active requests and leaves the rest queued; rate-limit and budget responses pause remaining work. Per-IP and global daily limits remain enforced on the server.
- One row status: queued, extracting, ready, needs attention or failed.
- Bottom-edge progress indicator and left-edge result status indicator.
- Receipt type classification.
- Extraction of merchant name, date, total amount, currency, confidence, notes, and line items.
- Editable details panel for manual correction.
- Zoom, rotate and pan the inline image beside the expanded editor.
- Red validation states for missing required fields.
- CSV exports current valid selected receipts and appends a structured `items` column.
- Version-2 JSON separates current values/items, original extraction and historical review metadata.

## Implementation

| Area | Implementation |
| --- | --- |
| API key safety | Gemini key is used only in the server-side API route. |
| Input validation | File type and size are checked before extraction. |
| Output validation | Gemini output is parsed, normalized, and validated with Zod. |
| Direct export | Valid values can export at any confidence level. Invalid data is flagged inline. |
| Abuse protection | Shared limits allow 15 calls per IP per minute and 100 provider calls per UTC day. |
| Test strategy | Default tests mock Gemini for deterministic CI. |
| Real integration | Optional live Gemini Playwright smoke test validates the real API path. |
| Deployment readiness | Vercel build, analytics, speed insights, and safe error messages are included. |

## AI Model And Prompt

The API uses Gemini through `POST /api/extract-receipt`. By default, the app uses:

```bash
GEMINI_MODEL=gemini-3.1-flash-lite
```

The extraction prompt asks Gemini to return strict JSON only, with these fields:

- `merchantName`
- `receiptType`
- `currency`
- `totalAmount`
- `date`
- `confidence`
- `notes`
- `items`

Important prompt rules:

- Do not guess unreadable values.
- Use `null` for missing or unclear fields.
- Classify receipt type into a fixed category list.
- Format dates as `YYYY-MM-DD` when possible.
- Return line items only when visible.
- Add short uncertainty notes for blurry, hidden, or ambiguous fields.

## API Contract

### `POST /api/extract-receipt`

Request:

- `multipart/form-data`
- field: `receipt`
- accepted MIME types: `image/jpeg`, `image/png`, `image/webp`
- max size: `5MB`

Success:

```json
{
  "data": {
    "merchantName": "AEON Wellness",
    "receiptType": "Groceries",
    "currency": "MYR",
    "totalAmount": 43.8,
    "date": "2026-05-12",
    "confidence": "high",
    "notes": [],
    "items": [
      {
        "name": "Gardenia Bread",
        "quantity": 1,
        "value": 3.8
      }
    ]
  }
}
```

Partial extraction still returns `200` with missing values as `null` and `confidence: "low"`. The frontend then marks the row as `Needs review`.

Error:

```json
{
  "code": "FILE_TOO_LARGE",
  "error": "Receipt image must be 5MB or smaller."
}
```

Current error codes:

```text
NO_RECEIPT_UPLOADED
INVALID_FILE_TYPE
FILE_TOO_LARGE
RATE_LIMITED
AI_PROVIDER_ERROR
INVALID_AI_RESPONSE
UNKNOWN_ERROR
```

## Architecture

```text
User
 ↓
Next.js frontend
 - upload up to 5 receipts
 - select files
 - preview images
 - review and edit extracted fields
 - export reviewed CSV
 ↓
POST /api/extract-receipt
 - server-side file validation
 - per-IP rate limiting
 - Gemini request
 - JSON extraction and normalization
 - Zod validation
 ↓
Gemini Vision
 ↓
Validated extraction draft
 ↓
Human review queue
 ↓
Reviewed CSV export
```

The AI handles uncertain visual extraction. Deterministic application code owns validation, completeness rules, UI state, downloads, and safe failure handling.

## Reliability And Security

- `GEMINI_API_KEY` is never exposed to the browser.
- Extraction accepts JPG, PNG, and WEBP on both client and server. ZIP files are opened only in the browser; the API receives selected images individually.
- Files above 5MB are rejected before extraction.
- Gemini responses are parsed and validated before reaching the UI.
- Required fields must be valid before a result becomes downloadable.
- `Needs review` results show red field-level validation and inline receipt preview.
- API failures return machine-readable error codes with safe public messages.
- Gemini requests use a timeout so the route does not wait indefinitely.
- Repeated extraction requests are rate limited per client IP.
- The app logs lifecycle events without logging API keys or image contents.
- Basic security headers are configured.

## Testing

Fast CI-style gate:

```bash
npm run ci
```

Full deterministic local gate:

```bash
npm run test:all
```

Individual checks:

```bash
npm run lint
npm run typecheck
npm run build
npm run test
npm run test:e2e
npm run audit:prod
```

Live Gemini smoke test:

```bash
npm run test:e2e:live
```

The default E2E suite mocks `/api/extract-receipt`, so it is deterministic and does not spend Gemini quota. The live command uses the real API route and should be run before recording the final demo.

See [TESTING.md](./TESTING.md) for the full coverage map.

## Tech Stack

- Next.js App Router
- React 19
- TypeScript
- Tailwind CSS
- Gemini API
- Zod
- Vitest and React Testing Library
- Playwright
- GitHub Actions
- Vercel Analytics and Speed Insights

## Getting Started

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env.local
```

Add Gemini configuration:

```bash
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.1-flash-lite
```

Run locally:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Deployment

1. Push this repository to GitHub.
2. Import the repository into Vercel.
3. Add environment variables:
   - `GEMINI_API_KEY`
   - `GEMINI_MODEL` optional
4. Deploy.
5. Open the production URL and run one live receipt extraction.

## Limitations And Next Steps

- Only image receipts are supported; PDF support is intentionally out of scope.
- Extraction quality depends on receipt clarity and Gemini availability.
- Queue state is client-side only and resets on refresh.
- Rate limiting is in-memory, and is not a distributed production limiter.
- A production version could add durable storage, authentication, OCR fallbacks, audit history, and Redis or Vercel KV rate limiting.

## Project Origin

Originally developed as a recruitment assessment, this repository is presented as a portfolio project. It is not a production client system or a claim of employment. The original development history and MIT license are preserved.

## Expense review release

Try two synthetic receipts without a provider call. Correct the stationery receipt against its image, save the change, mark it reviewed, and export expenses CSV. Editing a reviewed receipt blocks its export until it is saved and reviewed again. Discard restores the saved revision and its review status. Original model confidence remains separate from human review.

Images, pending edits, saved revisions and review status are stored in IndexedDB on this device, expiring seven days after editing. Browser storage can be evicted. Delete batch clears stored work. Interrupted extraction requires a manual retry. Expanded item editing and item CSV are deferred pending pilot evidence.

Production live extraction requires `GEMINI_API_KEY` and Redis REST credentials. The Vercel Upstash integration supplies `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically. Explicit `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` values take precedence. The Redis REST service must support EVAL. Reservations enforce 15 requests per IP per UTC minute and a global UTC daily budget, configured with `PROVIDER_DAILY_BUDGET` (default 100). Missing or unavailable budget storage blocks live extraction while samples remain available. Use the deployment platform's trusted proxy headers for client IPs.

Release verification requires the automated checks, deployed sample correction and CSV download, and a separate synthetic real-provider receipt. Roll back the deployment if exports differ from reviewed values or storage recovery loses edits. Never log receipt contents.

Pilot evidence is pending. Observe five expense preparers processing three synthetic receipts and opening the CSV in their usual spreadsheet. Record unaided completion counts, errors, time versus manual entry and cleanup. Retest shipped improvements with affected participants and record voluntary return use separately. No participant results are claimed by this release.

Transient provider failures (HTTP 500/502/503/504) get one retry after a short backoff, preserving the initial 45-second timeout and limiting the retry to 10 seconds. Every attempt reserves shared budget before calling Gemini. Unknown, minute, account-wide, zero-allocation and credential limits are not retried. A confirmed positive model-specific daily quota may use one configured Gemini fallback (`GEMINI_FALLBACK_MODEL`, default `gemini-3.1-flash-lite`; empty disables it). The unavailable primary is remembered within a warm server instance until the provider cooldown or Pacific daily reset; cold instances may rediscover the limit. Fallback and transient retry together remain bounded to two provider attempts per request. No other provider, key rotation, billing upgrade or quota increase is performed. Safe quota identifiers and retry delay are logged; raw messages, project identifiers, keys and receipt content are excluded. If both models lack allowance, extraction stops with the provider reset delay rather than cycling through models.

Pin `GEMINI_MODEL=gemini-3.1-flash-lite` as the primary. The legacy 2.5 primary reached its daily allowance and subsequently returned UNAVAILABLE after the reset; the current stable model removes that legacy dependency. An optional `GEMINI_FALLBACK_MODEL` must differ from the primary to be used; leave it empty when no alternate Gemini model is configured. Preview verification returned the correct USD 12.50 and USD 23.75 results for both synthetic receipts. Source identity, original model confidence and CSV values remain covered by the workflow tests.


## Runtime verification coverage

Runtime checks cover notes and formula-safe CSV/JSON round trips, keyboard preview focus, interrupted extraction, stop/resume, duplicate files, the five-receipt limit, storage quota failure, unsupported saved records, currency minor units, and legacy saved-data migration. CI runs the expense and runtime recovery checks in mobile WebKit as well as Chromium.

Saved records now use schema version 2 with image bytes in a separate IndexedDB image store. This supports WebKit runtimes that reject persisted Blob/File objects and avoids rewriting image bytes for each field correction. Existing schema-1 records migrate with corrections, review status and source identity retained. Images and queue metadata are committed together, and removed or expired receipts release their stored images.

Deployed browser automation uses Vercel’s `x-vercel-skip-toolbar` header so preview feedback widgets cannot obscure product controls. Live-provider verification records an initial 503 and exercises one explicit user retry when needed. Run live-provider scenarios sequentially to conserve the shared provider allowance.
