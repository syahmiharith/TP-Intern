# Receipt-to-Form Auto-Fill Web App

AI Intern Assessment submission project. This web app lets a user upload a receipt image, sends it to a generative AI model, extracts the required receipt fields, and auto-fills an editable form for review and submission.

## Features

- Upload a receipt image (`.jpg`, `.jpeg`, `.png`, `.webp`)
- Extract required receipt fields using Gemini Vision
- Auto-fill an editable form with extracted values
- Validate required fields before submission
- Submit data to browser localStorage
- Show final submitted JSON
- Vercel-ready Next.js project
- Automated unit, API, UI, E2E, and CI checks

## Required Fields Extracted

- Merchant name
- Date
- Total amount
- Currency

## Tech Stack

- Next.js
- TypeScript
- Tailwind CSS
- Gemini API via server-side API route
- Zod for response validation
- Vitest and React Testing Library for unit/API/UI tests
- Playwright for E2E tests
- GitHub Actions for CI

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create a `.env.local` file:

```bash
cp .env.example .env.local
```

Then add your Gemini API key:

```bash
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
```

`GEMINI_MODEL` is optional. If omitted, the app uses `gemini-2.5-flash`.

### 3. Run locally

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Testing

Run the fast delivery gate:

```bash
npm run ci
```

Run the full local gate including Playwright E2E:

```bash
npm run test:all
```

Install Playwright browsers before the first E2E run:

```bash
npx playwright install
```

See [`TESTING.md`](./TESTING.md) for the full testing strategy, coverage, manual QA checklist, and deployment checks.

## How It Works

1. The user uploads a receipt image.
2. The frontend sends the image to `POST /api/extract-receipt`.
3. The API route converts the file to base64 and sends it to Gemini.
4. Gemini returns strict JSON containing merchant name, date, total amount, and currency.
5. The app validates and displays the extracted fields in an editable form.
6. The user reviews, corrects if needed, and submits the form.
7. The final submission is saved in browser localStorage and displayed as JSON.

## Model Used

Default model:

```text
gemini-2.5-flash
```

The model can be changed with:

```bash
GEMINI_MODEL=your_model_name
```

Gemini 2.5 Flash was selected because it supports image input and text output, which fits receipt image extraction.

## Prompt Used

```text
You are a careful receipt data extraction assistant.

Extract only these required fields from the receipt image:
- merchantName
- date
- totalAmount
- currency

Return only valid JSON matching this exact schema:
{
  "merchantName": string | null,
  "date": string | null,
  "totalAmount": number | null,
  "currency": string | null,
  "confidence": "high" | "medium" | "low",
  "notes": string[]
}

Rules:
- Do not include markdown.
- Do not guess values that are not visible.
- Use null for unreadable or missing values.
- Format date as YYYY-MM-DD when possible.
- totalAmount must be a number only, without currency symbols.
- currency should be a 3-letter code when possible, such as MYR, USD, KRW, EUR, SGD.
- Add short notes for uncertainty, unreadable fields, or assumptions.
```

## Deployment on Vercel

1. Push this repository to GitHub.
2. Import the repository into Vercel.
3. Add environment variables in Vercel Project Settings:
   - `GEMINI_API_KEY`
   - `GEMINI_MODEL` optional
4. Deploy.

## Demo Video Checklist

Record a 1 to 2 minute video showing:

1. The app running locally or on Vercel.
2. Uploading a receipt image.
3. AI extraction result.
4. Auto-filled form.
5. Manual editing of one field.
6. Form submission and JSON output.

## Limitations

- Only image receipts are supported in this MVP.
- Poor image quality may reduce extraction accuracy.
- Database persistence is intentionally omitted because local/in-memory storage is acceptable for the assessment.
