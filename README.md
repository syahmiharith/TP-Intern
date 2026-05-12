# Receipt-to-Form Auto-Fill

Gemini-powered receipt extraction app built for the TP Malaysia AI Intern assessment. It converts a receipt image into structured form data, keeps a human review step before submission, and validates the full flow with deterministic tests plus an opt-in live Gemini smoke test.

**Live demo:** <https://tp-intern-malaysia.vercel.app/>

**Reviewer links:** [Testing Guide](./TESTING.md) · [Assessment Handoff](./docs/ASSESSMENT_HANDOFF.md) · [Demo Script](./docs/DEMO_SCRIPT.md)

## Reviewer Quick Path

1. Open the live demo.
2. Upload a clear JPG, PNG, or WEBP receipt.
3. Run AI extraction.
4. Review the extracted merchant, date, total amount, currency, confidence, and warnings.
5. Edit one field to confirm the AI output is reviewable.
6. Submit and inspect the saved JSON output.

## Project Ownership

I built this as an end-to-end AI-assisted workflow, not just a Gemini API call. The core ownership decisions were:

- Kept Gemini behind a server-side API route so the API key is never exposed to the browser.
- Treated AI output as a draft by requiring a user review/edit step before submission.
- Added validation at the upload, API, model-response, and form-submission boundaries.
- Added lightweight per-IP rate limiting to reduce Gemini quota abuse.
- Split tests into deterministic default coverage and a separate live Gemini smoke test.
- Deployed the app on Vercel and added Vercel Analytics and Speed Insights for production visibility.
- Kept persistence intentionally scoped to browser localStorage because durable storage was outside the assessment brief.

## What I Built

- Receipt upload for `.jpg`, `.jpeg`, `.png`, and `.webp`
- 5MB client and API upload limit
- Gemini Vision extraction for merchant name, date, total amount, and currency
- Editable review form with confidence and AI warnings
- Required-field and format validation before submit
- Currency normalization to uppercase on submit
- Structured `localStorage.latestReceiptSubmission` persistence with `id`, `createdAt`, `sourceFileName`, and reviewed data
- Reset flow that clears upload, preview, errors, extracted data, and submission output
- Mocked Playwright E2E suite and opt-in live Gemini E2E smoke test
- GitHub Actions CI, Dependabot, Vercel Analytics, and Speed Insights

## Why This Matters For TP Malaysia

The project models a practical operations automation workflow: turning messy receipt images into reliable structured data while preserving human control. That maps well to support, process improvement, and automation work because it reduces repetitive manual entry without blindly trusting the model.

The important part is the control system around the AI: input checks, strict JSON parsing, validation, rate limiting, failure handling, audit-clean dependencies, and tests that do not depend on Gemini uptime for every CI run.

## Engineering Decisions

| Decision | Reason |
| --- | --- |
| Server-side Gemini route | Protects `GEMINI_API_KEY` and centralizes validation. |
| Zod validation for model output | Prevents malformed Gemini responses from silently filling the form. |
| Deterministic normalizer | Keeps AI output predictable before it reaches the editable form. |
| Human review before submit | Keeps AI assistance useful without removing user control. |
| Mocked default E2E tests | Keeps CI deterministic, fast, and free from API quota issues. |
| Separate live Gemini smoke test | Verifies real integration only when explicitly requested. |
| In-memory rate limit | Adds assessment-appropriate abuse protection without introducing infrastructure complexity. |
| localStorage persistence | Matches MVP scope while still showing the final submitted payload. |

## Reliability & Security

- `GEMINI_API_KEY` is read only inside `POST /api/extract-receipt`.
- Uploads are restricted to JPG, PNG, and WEBP on both client and server, and capped at 5MB.
- Gemini is instructed to return strict JSON only.
- API responses are parsed and validated before reaching the form.
- API failures return machine-readable error codes with safe public messages.
- Gemini requests use a timeout so the API does not wait indefinitely.
- Missing, malformed, low-confidence, and failed extraction paths are covered by tests.
- Repeated extraction requests from the same client IP are rate limited.
- The API logs lifecycle events and error categories without logging API keys or image contents.
- Basic security headers are configured: `nosniff`, `DENY` framing, and strict-origin referrer policy.
- `npm audit --audit-level=moderate` currently reports zero vulnerabilities after dependency fixes.
- `.env` and local environment files are ignored by Git.

## Architecture

```text
User
 ↓
Next.js Frontend
 - upload receipt
 - preview image
 - review/edit extracted fields
 - submit reviewed result
 ↓
POST /api/extract-receipt
 - server-side file validation
 - per-IP rate limit
 - AI extraction service call
 - JSON parsing and normalization
 - Zod validation
 ↓
Gemini Vision
 ↓
Validated extraction result with warnings
 ↓
Editable review form
 ↓
localStorage.latestReceiptSubmission
```

The AI performs the uncertain extraction step. Deterministic application code owns validation, normalization, user review, fallback, and final structured output.

## API Contract

### `POST /api/extract-receipt`

Request:

- `multipart/form-data`
- field: `receipt`
- accepted types: `image/jpeg`, `image/png`, `image/webp`
- max size: `5MB`

Success:

```json
{
  "data": {
    "merchantName": "FamilyMart",
    "date": "2026-05-11",
    "totalAmount": 12000,
    "currency": "KRW",
    "confidence": "high",
    "warnings": []
  }
}
```

Partial extraction still returns `200` with empty fields as `null` and warnings for manual review.

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

## Accessibility, Observability, And Performance

- Upload, form inputs, and actions are keyboard accessible.
- Inputs use visible labels; invalid fields use `aria-invalid` and field-level error text.
- Error and success states are rendered as readable page content rather than browser alerts.
- API logs request lifecycle and failure categories, but never logs API keys, image contents, or base64 payloads.
- Vercel function logs are the intended debugging surface for production extraction failures.
- File size is capped at 5MB and previews are rendered client-side to keep the app lightweight.

## Demo Preview

Add final screenshots or a GIF before submission if available:

```text
docs/screenshots/upload.png
docs/screenshots/extracted-form.png
docs/screenshots/submit-summary.png
```

Demo video: add the final recording link here before sending the assessment.

## Validation Evidence

Main local gates:

```bash
npm run lint
npm run typecheck
npm run build
npm run test
npm run test:e2e
npm run audit
```

Coverage highlights:

- Unit tests for receipt schema conversion and form validation
- API tests for missing keys, upload boundaries, Gemini failures, malformed responses, and rate limiting
- UI tests for upload, extraction states, manual edits, validation, submit, and localStorage
- Playwright E2E for upload boundaries, extraction behavior, form review, persistence/reset, and responsive smoke
- Optional live Gemini E2E smoke test for real API validation

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

`GEMINI_API_KEY` is required for real extraction. `GEMINI_MODEL` is optional; if it is omitted, the API route uses `gemini-2.5-flash`.

Run locally:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Testing

Fast delivery gate:

```bash
npm run ci
```

Full local gate:

```bash
npm run test:all
```

Mocked E2E only:

```bash
npm run test:e2e
```

Live Gemini smoke test:

```bash
npm run test:e2e:live
```

The default E2E command mocks `/api/extract-receipt`, so it is deterministic and does not spend Gemini quota. The live command loads local env files, uses the real API route, and should be run manually before final submission or demo recording.

Install Playwright browsers once on a new machine:

```bash
npx playwright install
```

## How It Works

1. The user uploads a receipt image.
2. The frontend sends the file to `POST /api/extract-receipt`.
3. The API route validates the file and checks the rate limit.
4. The API route encodes the image and calls Gemini.
5. Gemini returns strict JSON for the required fields.
6. The AI service extracts JSON, normalizes it, validates it with Zod, and returns structured data.
7. The UI auto-fills an editable form.
8. The user reviews, corrects, and submits.
9. The reviewed submission is saved to browser localStorage with metadata and displayed as JSON.

## Deployment

1. Push this repository to GitHub.
2. Import the repository into Vercel.
3. Add environment variables in Vercel Project Settings:
   - `GEMINI_API_KEY`
   - `GEMINI_MODEL` optional
4. Deploy.
5. Open the production URL and run one live receipt extraction.

## Limitations & Next Steps

- Only image receipts are supported in this MVP.
- Extraction quality depends on receipt clarity and Gemini availability.
- The app stores only the latest submission in localStorage because durable database storage is outside the assessment scope.
- The rate limit is in-memory, which is appropriate for the assessment but not a complete distributed control across scaled serverless instances.
- A production version could add durable persistence, batch uploads, role-based review, and a distributed rate limiter such as Redis or Vercel KV.
