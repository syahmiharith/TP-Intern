# Receipt-to-Form operations

[Product overview and setup](../README.md) · [Release checks](REVIEW_GUIDE.md) · [Pilot security](SECURITY.md)

## Configuration and deployment

Deploy the Next.js app to Vercel with these server-side settings:

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Provider credential; never expose it to the browser. |
| `GEMINI_MODEL` | Primary model; current configuration uses `gemini-3.1-flash-lite`. |
| `GEMINI_FALLBACK_MODEL` | Optional distinct Gemini fallback; an empty value disables it. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Explicit shared-budget configuration. |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Vercel Upstash integration alternatives. |
| `PROVIDER_DAILY_BUDGET` | Global UTC daily allowance; defaults to 100 provider calls. |

Explicit Upstash values take precedence over the KV alternatives. Redis must support EVAL. Missing or unavailable budget storage blocks live extraction; public samples remain available. Pilot issuance, expiry, revocation and allowances are documented in [security controls](SECURITY.md).

Configure secrets in the deployment platform, build with `npm run build`, then verify the deployed sample and synthetic live-provider paths. Credentials and receipt contents must not appear in source, logs or screenshots.

## Import and queue boundaries

- Accept JPG, PNG and WebP images, up to 5 MB each and five receipts in the queue.
- ZIP import is browser-local: at most 25 MB and 200 entries. Folders and system metadata are omitted; unsupported files cannot be selected. Nested archives are not opened.
- Only selected images are decompressed, validated and queued. The API receives individual images, never the archive.
- At most two extractions run concurrently. Stopping the queue finishes active calls and leaves the rest queued.
- Extract retries selected queued or failed receipts without re-extracting successful results or replacing corrections.

## Provider failures and budgets

Every provider attempt reserves shared budget first. Limits are 15 requests per IP per UTC minute and the configured global daily allowance. Use trusted deployment proxy headers for client IPs.

Transient HTTP 500, 502, 503 and 504 failures receive one retry after a short backoff. The initial timeout is 45 seconds; the retry is limited to 10 seconds. Fallback and transient retry together are bounded to two provider attempts per request.

Unknown, minute, account-wide, zero-allocation and credential limits are not retried. A confirmed positive model-specific daily quota may use one configured, distinct Gemini fallback. An unavailable primary is remembered in the warm server instance until provider cooldown or the Pacific daily reset; a cold instance may rediscover the limit.

If both models lack allowance, extraction stops with the provider reset delay. Do not cycle credentials or providers, change billing or increase quotas as a recovery step. Log only safe quota identifiers and retry delay; exclude raw provider messages, project identifiers, credentials and receipt content.

## Storage and recovery

Images, expense fields, line items and queue state persist in IndexedDB on the current device. Records expire seven days after the last edit. Browser storage can be evicted, and **Clear all** removes the saved batch. Interrupted extraction becomes manually retryable.

Schema version 2 stores image bytes separately from queue metadata. This supports WebKit runtimes that reject persisted Blob/File objects and avoids rewriting images after every correction. Schema-1 records migrate with corrections, review status and source identity retained. Images and metadata commit together; removal and expiry release stored images.

The current entry is https://receipt-to-form-syahmiharith.vercel.app/. The older tp-intern-malaysia deployment retains a recovery workflow for receipts stored on that origin. Export those records there before clearing them and continuing on the current host; browser-local data does not migrate across hostnames.

## Export compatibility

CSV preserves the first nine columns and appends structured `items` JSON. Values and line items reflect the current valid selected records. Original confidence never gates export.

Version-2 JSON separates current `values` and `items` from `originalExtraction`. Historical approval belongs under `previousReview` when present. The legacy review timestamp stays blank unless an earlier approval still matches the unchanged receipt. Autosaving does not fabricate review.

## Release and rollback

Run the checks in [TESTING.md](../TESTING.md), then verify sample correction, refresh recovery and CSV download on the deployment. Separately run a synthetic real-provider receipt; mocked tests verify contracts, not live extraction accuracy.

Browser coverage includes notes and formula-safe CSV/JSON round trips, preview focus, interrupted work, stop/resume, duplicates, queue limits, storage failure, unsupported records, currency minor units and legacy migration. CI exercises expense and runtime recovery in mobile WebKit and Chromium.

Deployment automation uses `x-vercel-skip-toolbar` to keep Vercel feedback widgets clear of controls. Run live-provider scenarios sequentially to conserve allowance. A transient 503 may require the explicit user retry path.

Roll back if exports differ from current valid values or storage recovery loses edits. Preserve the existing origin for recovery; do not clear browser data to make a release check pass.

## User validation still required

Observe five expense preparers processing three synthetic receipts and opening the CSV in their usual spreadsheet. Record unaided completion, errors, time versus manual entry and cleanup. Retest shipped improvements with affected participants; record voluntary return use separately. No participant results are claimed.

## API Contract

### `POST /api/extract-receipt`

Request:

- `multipart/form-data`
- field: `receipt`
- accepted MIME types: `image/jpeg`, `image/png`, `image/webp`
- max size: `5MB`

Success:

```json
{
  "data": {
    "merchantName": "AEON Wellness",
    "receiptType": "Groceries",
    "currency": "MYR",
    "totalAmount": 43.8,
    "date": "2026-05-12",
    "confidence": "high",
    "notes": [],
    "items": [
      {
        "name": "Gardenia Bread",
        "quantity": 1,
        "value": 3.8
      }
    ]
  }
}
```

Partial extraction still returns `200` with missing values as `null` and `confidence: "low"`. The frontend then marks the row as `Needs attention`.

Error:

```json
{
  "code": "FILE_TOO_LARGE",
  "error": "Receipt image must be 5MB or smaller."
}
```

Error codes include:

```text
NO_RECEIPT_UPLOADED
INVALID_FILE_TYPE
FILE_TOO_LARGE
RATE_LIMITED
AI_PROVIDER_ERROR
INVALID_AI_RESPONSE
UNKNOWN_ERROR
```

