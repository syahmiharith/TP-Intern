# Pilot access and abuse controls

Live extraction is private during the pilot. Samples, editing and export remain public and account-free. Invite codes are capabilities: anyone given a code can use its remaining allowance. This bounds exposure; no public service can guarantee that abuse is impossible.

## Trust boundaries

| Boundary | Controls |
| --- | --- |
| Public caller → extraction API | Server verifies a signed session and current invite before parsing images or reserving provider calls. Cross-site browser requests are rejected. |
| Invite exchange | Random 128-bit codes; only hashes configured on the server. Bounded input, timing-safe comparison, coarse request limits. Raw codes never enter logs or browser storage. |
| Session | Signed, 24-hour maximum, HttpOnly, SameSite=Strict; production uses a Secure, host-only `__Host-` cookie. Invite removal or signing-key rotation invalidates access. End pilot session clears this browser's cookie. |
| Request → image | Real body byte ceiling and read timeout, MIME allowlist, 5 MB image limit, nonempty content and matching PNG/JPEG/WebP signature. No image URLs fetched from users. |
| Application → provider | Shared Redis EVAL reserves per-IP, global UTC-day and invite lifetime allowances atomically before every provider attempt, including retries. Missing production Redis fails closed. No refunds for failed provider calls. |
| Provider → application | Output-token cap, response-byte ceiling, request/body timeout, normalized JSON and safe public errors. Model output cannot invoke tools or access credentials. |
| Browser → spreadsheet | CSV text escaping and formula protection; original extraction and current corrections remain separate. |
| ZIP → browser | Local inspection; entry, compressed-byte and actual inflated-byte bounds; no nested archives or filesystem writes. |

The provider ceiling is 15 calls per IP per UTC minute and at most 100 globally per UTC day. `PROVIDER_DAILY_BUDGET` can lower that cap, never raise it above 100. Issued pilot codes last 14 days and allow 20 provider attempts each across devices and refreshes. The release-verification code lasts one day and allows one attempt. A retry consumes another attempt.

Vercel supplies the trusted IP header. Other production hosts use one conservative shared IP bucket until a trusted proxy integration exists. Local limiter buckets are bounded; shared provider limits remain authoritative across instances. Do not deploy public development servers.

The edge policy limits POST `/api/` requests to 30 per IP per minute before function invocation. Check the release PR for publication and live-verification evidence; a staged rule is not active. Vercel's existing automatic mitigations remain enabled. Historical and branch deployment URLs were verified to require Vercel authentication; verify this again when project protection settings change.

## Issuing and revoking access

1. Create an existing private directory outside the repository, with permissions 0700.
2. Run `node scripts/create-pilot-invites.mjs /absolute/private/directory/invites.json`. The script refuses repository paths and existing files, writes mode 0600, and prints no codes.
3. Configure `PILOT_SESSION_SECRET` with `sessionSecret` and `PILOT_INVITE_HASHES` with the JSON `configuration` array, as sensitive server environment variables. Configure the intended production and preview project, then redeploy.
4. Assign one of the five pilot codes per participant privately. Never commit the credential file, put codes in URLs, or include them in public feedback/screenshots. No invitations are sent by the issuer.
5. Remove an invite hash and redeploy to revoke that code and its sessions. Rotate the session secret and redeploy to end all sessions. Replace a compromised code with a new random code, not the same hash or a reset quota.

Set `LIVE_EXTRACTION_ENABLED=false` and redeploy for an extraction kill switch. Samples remain available. Do not export production secrets for diagnostics.

## Verification

- Test direct unauthenticated calls, forged/expired/revoked sessions, cross-site requests, MIME spoofing, oversized/chunked bodies, invalid configuration, Redis failures and bounded retries.
- Test public samples/export and keyboard/mobile invite entry; confirm codes are absent from local/session storage and saved receipt records.
- Inspect one real synthetic extraction using the single-call verification code. A second valid request must hit the lifetime cap without another provider attempt. Verify the original CSV values and request identity. Avoid load tests against the real provider or exhausting the shared pilot budget.
- Run native dependency audits, lint, type checking, unit/API/UI suites, browser suites and build. Record executable and deployed revisions in the release PR.

Residual limits: codes can be deliberately shared; a compromised authorized browser can use the code's remaining quota; distributed traffic can still affect availability. These controls do not claim perfect bot detection or unlimited DDoS protection. Recruitment stays paused until the protected production journey is verified.
