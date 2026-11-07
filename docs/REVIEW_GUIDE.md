# Receipt-to-Form release checks

Main entry: https://receipt-to-form-syahmiharith.vercel.app.

## Product journey

Upload up to five images, or use optional samples. Expand a row to see every expense field, immutable notes, editable items and an interactive image. Current values save automatically on this device. There is no Save, Discard or Mark reviewed step. Any valid selected receipt can export immediately, independently of model confidence.

A collapsed row shows its filename, one status pill and compact controls. Selection has no surrounding border or instructional subtext. Receipt type uses the same searchable dropdown design as currency. Merchant and item names are text; quantities accept positive fractions; prices are decimal strings and may include zero or discounts. Unknown quantities/prices remain blank. Dates use the platform calendar. Receipt total remains independent of item edits so tax, tips and discounts are not silently overwritten.

## Verification

- Export samples directly. Set an invalid total, verify immediate exclusion, then correct it and refresh. Inspect current values in the downloaded CSV without an approval step.
- Edit item name, fractional quantity and price. Refresh and inspect exact strings in CSV's appended `items` column and JSON's `items`. Check unchanged original extraction, confidence and receipt ID.
- Add/remove an item. Test currency decimals, zero and negative prices, unknown blanks and invalid exponent notation.
- Collapse/expand: all details belong inside the expanded editor; exactly one status pill remains on the row.
- Exercise inline zoom, rotation, pointer dragging and keyboard panning. Fields and image remain available together on mobile.
- Retain mixed samples/uploads, retries, stopping, storage failure, expiry, deletion, schema migration and legacy-host recovery checks.
- Check 360px, 375px, tablet and desktop. The bottom toolbar must not obstruct fields.

## Output compatibility

IndexedDB remains version 2. Existing images, corrections and old review metadata are preserved. JSON provenance is version 2: current `values` and `items` are separate from `originalExtraction`; historical approval is under `previousReview` when present. CSV retains its first nine columns and appends `items` as JSON. The historical review timestamp column is blank unless an earlier approval still matches the unchanged receipt. Automatic saving never fabricates review.

Run lint, types, unit/API/UI tests, Playwright, production build, the deployed sample path and an explicitly enabled synthetic live-provider extraction. Do not use real expense data for showcase testing.
