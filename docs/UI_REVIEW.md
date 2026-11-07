# Workflow UI decisions

Use an icon alone for a familiar utility with a clear local scope. Keep a visible label when an action changes saved work, commits a review, starts a request, or produces a file. Use text alone when an icon adds little meaning. Icon controls have accessible names, tooltips and 44px targets; focus remains visible.

| Stage | Controls | Relevant state |
| --- | --- | --- |
| Loading saved work | Upload and samples disabled | Announce loading before accepting new receipts. |
| Empty | Upload: icon and label. Try samples: secondary text. | Formats, size and batch limit sit beside upload. Privacy details stay in the footer. |
| Checking files | Existing upload controls disabled | Announce checking; show duplicate, type and size errors. |
| Queued | Extract and Add files: icon and label. Selection: pressed-state control. Clear all: text. | Show queued receipts and selection count. CSV stays disabled with exclusions on the cards. |
| Reading | Stop queue: icon and label, only while receipts remain after the current request. | Show actual processed counts. Lock selection and deletion. Stopping finishes the active request; it does not imply cancellation. |
| Failed or interrupted | Retry: icon and label on that receipt. | Keep the full error visible. Avoid an empty expense form. Successful receipts remain intact. |
| Editing | Save changes: icon and label. Discard changes: text. | Show unsaved status; block review and export. Validation identifies and focuses the first invalid field. |
| Saved, unreviewed | Mark reviewed: icon and label. | Show Needs review. Hide Save and Discard when there is no pending edit. |
| Reviewed | No redundant commit controls | Show Reviewed even when expanded. Editing restores the pending-edit controls and blocks export. Model confidence remains separate. Collapsed totals preserve the field string, including three-decimal currencies. |
| Image inspection | Preview, rotate, zoom and close: labelled icons. Mobile image/form switch: icon and label. | Keep controls outside the scrollable image; allow keyboard panning, focus cycling and Escape with focus return. Collapse file metadata. Announce image loading; unreadable images show a recovery message and keep Close available. |
| Export | One primary CSV action: icon and label with eligible count. JSON: secondary text button when eligible; its file icon is not self-explanatory. | Explain each selected exclusion on its card. Export starts a browser download; an in-flow status avoids obscuring fields. |
| Recovery | Clear all: text. Main-app route: link. | Keep storage and legacy-origin errors actionable. Do not auto-redirect unreadable or unsupported saved work. |
| Footer | Related-work, source and feedback links: icon and label. Privacy: native disclosure. | Preserve browser-local work when opening external links. Keep provider identity in privacy details. |

Avoid headings that repeat the surrounding receipt context, repeated confidence labels, decorative hover rings, permanent inactive extraction controls, and fake percentage progress. Extracted line items are optional read-only details. Save must never invalidate an unchanged reviewed revision. Pointer hover must not rewrite saved work.

These choices preserve the existing app, receipt IDs, persistence schema, CSV columns, original extraction and API contract. Deterministic tests cover the states in `tests/e2e/workflow-ui.spec.ts` alongside the existing workflow, preview, upload, recovery and export suites. Device-width checks use 375px, 768px and 1280px; mobile browser evidence is emulation.
