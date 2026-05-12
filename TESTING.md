# Testing Guide

This project includes a layered test suite designed to reduce delivery chaos before submitting the AI Intern Assessment.

## Test Layers

| Layer | Command | Purpose |
| --- | --- | --- |
| Lint | `npm run lint` | Catch formatting, React, and Next.js rule issues. |
| Typecheck | `npm run typecheck` | Catch TypeScript errors before build/deploy. |
| Production build | `npm run build` | Verify the app compiles for Vercel. |
| Unit tests | `npm run test:unit` | Test receipt schema, conversion, and form validation logic. |
| API tests | `npm run test:api` | Test `/api/extract-receipt` with mocked Gemini responses. |
| UI tests | `npm run test:ui` | Test upload, extraction states, editable form, validation, and localStorage. |
| E2E tests | `npm run test:e2e` | Test full browser flows using Playwright. |
| Live Gemini E2E smoke | `npm run test:e2e:live` | Optional real Gemini smoke that loads local env files and calls Gemini. |
| Full local gate | `npm run test:all` | Run all quality gates and E2E tests. |

## Recommended Pre-Submission Command

Run this before recording the demo video or deploying:

```bash
npm run test:all
```

If you want a faster check while developing:

```bash
npm run ci
```

`npm run ci` runs linting, typechecking, production build, and Vitest tests. It does not run Playwright E2E.

## First-Time Playwright Setup

Install browsers once:

```bash
npx playwright install
```

For Linux CI or a fresh machine:

```bash
npx playwright install --with-deps
```

## What Is Covered

### Unit Tests

File:

```text
tests/unit/receipt.test.ts
```

Covers:

- Valid receipt extraction schema
- Safe defaults for missing confidence/notes
- Conversion from AI extraction result to editable form values
- Required merchant name validation
- Required date validation
- Total amount validation
- Currency format validation

### API Tests

File:

```text
tests/api/extract-receipt.test.ts
```

Covers:

- Missing `GEMINI_API_KEY`
- Missing uploaded file
- Non-image upload rejection
- File size limit rejection
- Successful Gemini JSON extraction
- Gemini JSON wrapped in markdown fences
- Gemini API failure handling
- Invalid Gemini text response handling

The API tests mock `fetch`, so they do not spend API credits or depend on Gemini uptime.

### UI Tests

File:

```text
tests/ui/home.test.tsx
```

Covers:

- Initial page render
- Unsupported file rejection
- Valid image preview
- Successful AI auto-fill
- Extraction failure message
- Required field validation
- Manual editing
- Submit flow
- localStorage persistence

### E2E Tests

File:

```text
tests/e2e/receipt-flow.spec.ts
```

Covers:

- Happy path: upload → extract → edit → submit
- API failure without crashing
- Low-confidence extraction corrected manually
- Required field validation

The E2E tests mock the extraction API. This keeps tests deterministic and avoids failures caused by network/API issues.

The live Gemini smoke test is intentionally separate from the default E2E command. It loads `GEMINI_API_KEY` and `GEMINI_MODEL` from the repo's local env files. Run it only when you want to spend a real Gemini request:

```bash
npm run test:e2e:live
```

## Manual QA Still Required

Automated tests verify app behavior, but they do not prove real AI extraction quality. Before submission, manually test with at least 3 real receipt images:

1. A clear Malaysian receipt with MYR.
2. A clear Korean receipt with KRW.
3. A blurry or difficult receipt to confirm the app handles uncertainty.

Manual acceptance checklist:

- Receipt upload works.
- Receipt preview appears.
- AI extraction returns merchant name, date, total amount, and currency.
- User can edit all extracted fields.
- Validation prevents incomplete submission.
- Submit shows final JSON.
- No API key appears in the browser console or frontend source.
- Vercel production URL works after adding environment variables.

## Vercel Deployment Check

After deploying to Vercel:

1. Add environment variables:

```bash
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
```

2. Open the deployed URL.
3. Upload a real receipt.
4. Confirm extraction works in production.
5. Check Vercel function logs if extraction fails.

## Known Test Design Decision

The automated tests mock Gemini responses intentionally. Real AI calls are reserved for manual QA because generative outputs can vary and can make CI flaky.
