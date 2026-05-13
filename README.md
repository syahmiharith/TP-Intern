# AI Receipt-to-Form Auto-Fill

Gemini-powered receipt extraction web app built for the TP Malaysia AI Intern assessment. The app turns receipt images into structured, reviewable data through a CloudConvert-style processing queue: upload receipts, extract selected files, review uncertain fields, and download only complete JSON outputs.

**Open the live assessment app:** <https://tp-intern-malaysia.vercel.app/>

**Setup shortcuts:** [Getting Started](#getting-started) · [Deployment](#deployment)

**Reviewer docs:** [Testing Guide](./TESTING.md) · [Assessment Handoff](./docs/ASSESSMENT_HANDOFF.md) · [Demo Script](./docs/DEMO_SCRIPT.md)

## Quick Path

1. Open the live demo.
2. Upload one to five JPG, PNG, or WEBP receipt images.
3. Select the files to process and click **Extract**.
4. Preview receipts, review extracted fields, and fix any `Needs review` result using the inline receipt preview.
5. Confirm complete rows show a download action.
6. Download per-receipt JSON or selected complete JSON results.

## Why This Is More Than An API Call

The assessment asks for receipt upload, generative AI extraction, editable review, and structured output. I implemented that as a human-in-the-loop extraction queue rather than a single throwaway form.

Key product decisions:

- AI creates the first draft; the user remains responsible for uncertain or incomplete fields.
- Batch queue UX supports up to five receipts while keeping extraction sequential to reduce quota risk.
- Download is available only when the required structured fields are complete.
- The backend stays small: one secure `POST /api/extract-receipt` route handles validation, rate limiting, and Gemini calls.

## What I Built

- Upload queue for up to five receipt images.
- Supported files: JPG, PNG, WEBP, max 5MB each.
- Auto-selection for newly uploaded files.
- Preview modal for every uploaded receipt.
- Selected-file extraction with sequential API calls.
- Item-level extracting, extracted, needs-review, failed, and edited states.
- Bottom-edge progress indicator and left-edge result status indicator.
- Receipt type classification.
- Extraction of merchant name, date, total amount, currency, confidence, notes, and line items.
- Editable details panel for manual correction.
- Inline receipt preview inside `Needs review` details so users can compare the image while fixing fields.
- Red validation states for missing required fields.
- JSON download only for complete results.
- Batch JSON download that includes only selected complete results.

## Engineering Signals

| Area | Implementation |
| --- | --- |
| API key safety | Gemini key is used only in the server-side API route. |
| Input validation | File type and size are checked before extraction. |
| Output validation | Gemini output is parsed, normalized, and validated with Zod. |
| Human review | Low-confidence or incomplete results become `Needs review`. |
| Abuse protection | In-memory per-IP rate limit allows 15 extractions per minute. |
| Test strategy | Default tests mock Gemini for deterministic CI. |
| Real integration | Optional live Gemini Playwright smoke test validates the real API path. |
| Deployment readiness | Vercel build, analytics, speed insights, and safe error messages are included. |

## AI Model And Prompt

The API uses Gemini through `POST /api/extract-receipt`. By default, the app uses:

```bash
GEMINI_MODEL=gemini-2.5-flash
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
 - download complete JSON
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
Complete JSON download
```

The AI handles uncertain visual extraction. Deterministic application code owns validation, completeness rules, UI state, downloads, and safe failure handling.

## Reliability And Security

- `GEMINI_API_KEY` is never exposed to the browser.
- Uploads are restricted to JPG, PNG, and WEBP on both client and server.
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
GEMINI_MODEL=gemini-2.5-flash
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
- Rate limiting is in-memory, which is suitable for the assessment but not a distributed production limiter.
- A production version could add durable storage, authentication, OCR fallbacks, audit history, and Redis or Vercel KV rate limiting.
