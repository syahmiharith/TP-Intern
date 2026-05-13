# Demo Script

Target length: 60 to 90 seconds.

## Opening

This is an AI receipt-to-form auto-fill app for the AI Intern assessment. It uses Gemini Vision to extract structured receipt data, then keeps a human review step before any result can be downloaded.

## Walkthrough

1. Open the app and point out the receipt extraction queue.
2. Upload two receipt images to show batch handling.
3. Select the files and click **Extract**.
4. Show item-level progress and status changes.
5. Open a receipt preview to confirm the uploaded image.
6. Expand a complete result and show merchant, receipt type, currency, total, date, confidence, notes, and line items.
7. Show the download icon appears only for complete results.
8. Show a `Needs review` result if available.
9. Expand it and use the inline receipt preview beside the form to manually fix missing fields.
10. Save changes and show the row becomes `Edited` with a download action.
11. Download selected complete JSON results.

## Technical Talking Points

- The Gemini API key is protected behind a server-side Next.js route.
- The app validates file type, file size, model output, and required fields.
- Low-confidence or incomplete extraction does not become downloadable until reviewed.
- Default automated tests mock Gemini, so CI is deterministic and does not depend on quota or model uptime.
- A separate live Gemini smoke test validates the real integration before final demo recording.

## Closing

The goal is not only to call an AI API. The goal is to make an AI-assisted workflow reliable: validate inputs, normalize model output, handle uncertainty, protect secrets, support manual correction, and test the important paths.
