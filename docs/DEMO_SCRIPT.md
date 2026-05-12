# Demo Script

Target length: 60 to 90 seconds.

## Opening

This is a receipt-to-form auto-fill web app for the AI Intern assessment. It uses Gemini Vision to extract required receipt fields, then keeps a human review step before submission.

## Walkthrough

1. Open the app.
2. Upload a clear receipt image.
3. Click **Extract Data with AI**.
4. Show the extracted merchant, date, total amount, currency, confidence, and notes.
5. Edit one field to show that AI output is reviewable.
6. Submit the form.
7. Show the final JSON output saved locally.

## Testing Point

The project has deterministic E2E tests that mock Gemini, so CI does not depend on API quota or model availability. It also has an opt-in live Gemini smoke test for validating the real integration before demo or submission.

## Closing

The goal is not only to call an AI API. The goal is to make an AI-assisted workflow reliable: validate input, handle API failures, keep the API key server-side, let the user correct uncertain data, and test the important paths.
