# Assessment Handoff

Quick reviewer path for the TP Malaysia AI Intern assessment.

## What To Review First

1. Open the live app: <https://tp-intern-malaysia.vercel.app/>.
2. Upload one to five receipt images.
3. Select the files to process and click **Extract**.
4. Open the preview modal to inspect the uploaded image.
5. Expand a completed or needs-review row.
6. For `Needs review`, compare the inline receipt preview with the editable fields and fix missing values.
7. Confirm complete rows show a download icon.
8. Download one result or selected complete results as JSON.

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
- Supports batch queue behavior without adding unnecessary backend complexity.
- Treats AI extraction as a draft and keeps human review in the loop.
- Distinguishes failed extraction from partial extraction.
- Requires manual correction for incomplete AI fields before download.
- Shows inline receipt preview during review to reduce user friction.
- Validates required receipt fields before a result becomes downloadable.
- Separates deterministic CI tests from live AI validation.
- Documents deployment, testing, and known MVP limits.

## Known Scope

The app intentionally keeps queue state in the browser and uses a single extraction API route. Durable persistence, authentication, PDF support, real Google Drive upload, URL upload, and accounting-system integrations are outside this assessment version.
