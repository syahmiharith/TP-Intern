# Assessment Handoff

This document is the quick reviewer path for the TP Malaysia AI Intern assessment.

## What To Review First

1. Run the app and upload a receipt.
2. Review the extraction result, confidence badge, and notes.
3. Edit one field and submit.
4. Check the JSON output and `localStorage.latestReceiptSubmission`.
5. Run the mocked E2E suite.
6. Run the live Gemini smoke test if a Gemini API key is available.

## Commands

```bash
npm install
npm run dev
```

```bash
npm run ci
npm run test:e2e
npm run test:e2e:live
```

## Environment

```bash
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
```

`GEMINI_API_KEY` is required for real extraction. `GEMINI_MODEL` is optional.

## Assessment Signals

- Uses a server-side API route so the Gemini key is not exposed to the browser.
- Handles file type and file size validation on the client and API boundary.
- Treats AI extraction as a draft and keeps human review before submission.
- Validates required receipt fields before saving.
- Separates deterministic CI tests from live AI validation.
- Documents manual QA and deployment checks.

## Known Scope

The MVP stores only the latest reviewed submission in browser localStorage. Durable persistence, authentication, batch processing, and accounting-system integrations are intentionally outside scope for this assessment version.
