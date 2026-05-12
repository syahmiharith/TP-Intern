# Receipt-to-Form Auto-Fill Web App

AI Intern Assessment project for TP Malaysia. The app turns a receipt image into reviewed, structured data: upload a receipt, extract the required fields with Gemini Vision, edit anything uncertain, validate the form, and submit the final JSON locally.

Live demo: <https://tp-intern-malaysia.vercel.app/>

## Why This Project Matters

This project models a common operations workflow: converting messy receipt images into reliable structured fields for downstream processing. It keeps the AI useful but supervised:

- Gemini handles the first-pass extraction.
- The user reviews and edits before submission.
- Validation blocks incomplete or malformed data.
- Automated tests cover normal, failure, malformed, responsive, and live-AI smoke paths.

That combination is relevant to process automation, back-office support, troubleshooting, and documentation work expected in an AI/IT internship.

## Demo Path

Use this flow when showing the project:

1. Upload a clear JPG, PNG, or WEBP receipt.
2. Click **Extract Data with AI**.
3. Point out merchant, date, amount, currency, confidence, and AI notes.
4. Edit one field to show human review.
5. Submit and show the saved JSON output.
6. Mention that CI uses mocked Gemini responses while `npm run test:e2e:live` validates the real Gemini integration on demand.

## Features

- Receipt upload for `.jpg`, `.jpeg`, `.png`, and `.webp`
- 5MB upload limit with client and API validation
- Server-side Gemini Vision extraction
- Strict JSON parsing and Zod validation for model output
- Editable review form for merchant name, date, total amount, currency, and notes
- Required-field and format validation before submit
- Currency normalization to uppercase on submit
- `localStorage.latestReceiptSubmission` persistence
- Reset flow that clears upload, preview, errors, form data, and submission
- Mocked Playwright E2E suite plus opt-in live Gemini smoke test
- GitHub Actions and Vercel-ready project structure

## Tech Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Gemini API through a server-side route
- Zod
- Vitest and React Testing Library
- Playwright
- GitHub Actions

## Required Receipt Fields

- Merchant name
- Date
- Total amount
- Currency

## Getting Started

Install dependencies:

```bash
npm install
```

Create a local env file:

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

See [TESTING.md](./TESTING.md) for the full coverage map and manual QA checklist.

## How It Works

1. The user uploads a receipt image.
2. The frontend sends the file to `POST /api/extract-receipt`.
3. The API route validates the file, encodes it as base64, and calls Gemini.
4. Gemini is prompted to return strict JSON only.
5. The API route extracts JSON, validates it with Zod, and returns structured data.
6. The UI auto-fills an editable form.
7. The user reviews, corrects, and submits.
8. The final normalized submission is saved to browser localStorage and displayed as JSON.

## Prompt Strategy

The extraction prompt asks Gemini to return only:

- `merchantName`
- `date`
- `totalAmount`
- `currency`
- `confidence`
- `notes`

The prompt also tells the model not to guess unreadable values, to use `null` for missing fields, to format dates as `YYYY-MM-DD` when possible, and to return a 3-letter currency code when possible.

## Deployment On Vercel

1. Push the repository to GitHub.
2. Import it into Vercel.
3. Add environment variables in Vercel Project Settings:
   - `GEMINI_API_KEY`
   - `GEMINI_MODEL` optional
4. Deploy.
5. Open the production URL and run one live receipt extraction.

## Assessment Handoff Checklist

Before sending the repository:

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run test`
- `npm run test:e2e`
- `npm run test:e2e:live`
- Confirm `.env` and `.env.local` are not committed.
- Include a deployed URL or short demo recording.

## Limitations

- Only image receipts are supported in this MVP.
- Extraction quality depends on receipt clarity and Gemini availability.
- The app stores only the latest submission in localStorage because durable database storage is outside the assessment scope.
- Automated tests reduce regressions but cannot prove every real-world receipt format is handled perfectly.
