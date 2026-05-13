# Testing Guide

This project uses layered tests so the assessment can be reviewed with confidence without depending on Gemini uptime for every run.

## Test Layers

| Layer | Command | Purpose |
| --- | --- | --- |
| Lint | `npm run lint` | Catch React, Next.js, and code-quality issues. |
| Typecheck | `npm run typecheck` | Catch TypeScript errors before build/deploy. |
| Production build | `npm run build` | Verify the app compiles for Vercel. |
| Unit tests | `npm run test:unit` | Test receipt schema, normalization, completion, and form validation logic. |
| API tests | `npm run test:api` | Test `/api/extract-receipt` with mocked Gemini responses. |
| UI tests | `npm run test:ui` | Test upload, queue state, extraction states, review, validation, and download visibility. |
| Mocked E2E tests | `npm run test:e2e` | Test full browser flows with deterministic mocked extraction responses. |
| Live Gemini E2E smoke | `npm run test:e2e:live` | Optional real Gemini smoke using local env files. |
| Production audit | `npm run audit:prod` | Check runtime dependency vulnerabilities. |
| Full local gate | `npm run test:all` | Run lint, typecheck, build, Vitest, and mocked E2E tests. |

## Recommended Pre-Submission Commands

Run the full deterministic gate:

```bash
npm run test:all
```

Run the real Gemini smoke test once before demo recording:

```bash
npm run test:e2e:live
```

`npm run test:e2e:live` requires `GEMINI_API_KEY` in a local env file. `GEMINI_MODEL` is optional.

## First-Time Playwright Setup

Install browsers once:

```bash
npx playwright install
```

For Linux CI or a fresh Linux machine:

```bash
npx playwright install --with-deps
```

## Unit Coverage

File:

```text
tests/unit/receipt.test.ts
```

Covers:

- Receipt extraction schema defaults.
- Receipt type classification values.
- Line item schema and nullable quantity/value handling.
- Normalization for amount, currency, merchant, type, date, notes, and items.
- Completion checks for required fields and confidence.
- Conversion between AI extraction data and editable form values.
- Required merchant name and receipt type validation.
- Required date validation.
- Total amount validation.
- Currency format validation.
- Manual form values converted back into complete extraction data.

## API Coverage

File:

```text
tests/api/extract-receipt.test.ts
```

Covers:

- Missing `GEMINI_API_KEY`.
- Missing uploaded file.
- Non-image upload rejection.
- Strict MIME allowlist rejection for SVG and GIF.
- Accepted JPG, PNG, and WEBP uploads.
- File size limit rejection.
- Successful Gemini JSON extraction.
- Gemini JSON wrapped in markdown fences.
- Partial Gemini responses normalized with review notes.
- Receipt type and line item extraction.
- Gemini API failure handling.
- Gemini timeout/abort handling.
- Per-IP extraction rate limiting at 15 requests per minute.
- Machine-readable API error codes.
- Safe public message for unexpected failures.
- Invalid Gemini text response handling.

The API tests mock `fetch`, so they do not spend API credits or depend on Gemini uptime.

## UI Coverage

File:

```text
tests/ui/home.test.tsx
```

Covers:

- Initial page render with upload area.
- Unsupported file rejection.
- Multiple valid uploads as selected queue items.
- Delete behavior and preview URL cleanup.
- Footer extraction controls.
- Successful extraction summary and download visibility.
- Partial low-confidence extraction becoming `Needs review`.
- Inline receipt preview inside the review panel.
- Manual corrections changing a result to `Edited`.
- Preview modal behavior.

## E2E Coverage

Shared helpers:

```text
tests/e2e/support/receipt.ts
```

Specs:

```text
tests/e2e/upload-boundaries.spec.ts
tests/e2e/extraction.spec.ts
tests/e2e/form-review.spec.ts
tests/e2e/persistence-reset.spec.ts
tests/e2e/responsive-smoke.spec.ts
tests/e2e/live-gemini.spec.ts
```

The default E2E suite mocks `/api/extract-receipt` and covers:

- Initial upload-only state.
- Accepted JPG, PNG, and WEBP uploads.
- Rejected non-image uploads.
- Rejected images over 5MB.
- Queue limit of five files.
- Preview modal and file metadata rendering.
- Selected-file extraction.
- Extracting row state and progress.
- High, medium, and low confidence extraction responses.
- `Needs review` manual correction flow.
- API 400, 429, and 500 failure states.
- Failed rows remaining retryable.
- Processed rows skipped during selected extraction.
- Select all and deselect all behavior.
- Delete behavior and file-count update.
- Receipt type rendering.
- Line item table rendering.
- Download visibility only for complete results.
- Desktop and mobile responsive smoke flows.

## Live Gemini Smoke

File:

```text
tests/e2e/live-gemini.spec.ts
```

Run:

```bash
npm run test:e2e:live
```

This test does not mock `/api/extract-receipt`. It uploads a generated receipt image with clear printed values and asserts:

- The app does not crash.
- Required fields are populated.
- Total amount is parseable and positive.
- Currency is a 3-letter code.
- The extraction reaches a reviewable or downloadable state.

It intentionally avoids exact-value assertions because generative extraction can vary.

## Manual QA Checklist

Before final submission, manually test with at least:

1. A clear Malaysian receipt with MYR.
2. A clear Korean receipt with KRW.
3. A difficult or blurry receipt to confirm `Needs review`.

Manual acceptance checklist:

- Receipt upload works.
- Upload limit and file validation work.
- Receipt preview modal opens.
- Selected extraction works.
- AI extraction returns merchant name, date, total amount, currency, receipt type, and line items when visible.
- Missing fields are highlighted in the expanded details panel.
- Inline receipt preview is visible during needs-review correction.
- User can edit required fields and save changes.
- Complete results show download actions.
- Partial or failed results do not show download actions.
- No API key appears in the browser console or frontend source.
- Production URL works after adding environment variables.

## Vercel Deployment Check

After deploying to Vercel:

1. Add environment variables:

```bash
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
```

2. Open the deployed URL.
3. Upload a real receipt.
4. Run extraction.
5. Confirm complete results can be downloaded.
6. Check Vercel function logs if extraction fails.

## Known Test Design Decision

Gemini is mocked in default automated E2E tests because real AI calls can fail due to quota, model latency, temporary service load, or minor output variance. The live Gemini test is separate so reviewers can validate real integration deliberately without making CI flaky.
