# Receipt-to-Form review guide

Main entry: https://receipt-to-form-syahmiharith.vercel.app.

## Product journey

Upload up to five supported images, or load optional samples. All receipts use one queue, editor and storage path. Extract uploads and compare the image with the fields. After an edit, Save changes commits the revision; Mark reviewed approves it. Unchanged receipts can be reviewed directly. Discard changes restores the saved revision and its review status.

Use the batch toolbar's single CSV export action for eligible selected receipts. Each selected exclusion is explained on its card. JSON is secondary provenance output. Editing a reviewed receipt immediately blocks its export; refresh must restore that pending edit. Original model confidence remains unchanged by human corrections.

## Checks

- Correct the sample stationery total from 23.00 to 28.00, save and review; inspect the downloaded CSV.
- Edit a reviewed total, verify export blocks, refresh, restore the pending correction, save and review again. Confirm CSV, receipt ID and original confidence.
- Test Discard separately and verify reviewed export eligibility returns.
- Mix samples and an uploaded synthetic receipt in the same queue.
- Exercise keyboard preview and card actions, mobile image/form switching, validation, retries and stopping remaining work.
- Check 375px, tablet and desktop widths; the toolbar must not obscure fields or receipt actions.
- Verify an empty legacy origin redirects only after storage loads. Existing legacy receipts, unknown schemas and storage errors must stay recoverable. Explicit clearing must complete before navigation.

## Engineering checks

Run lint, TypeScript, unit/API/UI tests, Playwright and production build. Deterministic tests mock the provider; real extraction is separately enabled with RUN_LIVE_GEMINI_E2E=1. Shared rate/budget limits and provider quota still apply. Never upload real expense data for showcase testing.
