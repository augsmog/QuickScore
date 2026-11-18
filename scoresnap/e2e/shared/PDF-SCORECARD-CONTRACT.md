# Saved PDF fixture and comparison (Refs AUG-1277 / AUG-402)

The PDF Maestro flow now launches a clean-install offline app with the frozen
`pdf-settled-round.json` contest persisted in `asyncstorage-pdf-settled.json`.
The course has 18 par-four holes; totals are 71,72,72. The single $1 gross skin
allocates a $0.67 net result to Zoë Łukasz, -$0.33 to Алексей and -$0.34 to
Δημήτρης. The cent allocation and descending result order are frozen expectations,
not recomputed by the comparator. Names cover accented Latin, Greek and Cyrillic.

The app already writes its export to local cache before opening the share sheet.
The runner collects exactly one export from the clean install's scoped
`Library/Caches/**/scorecard-pdf-exports/` directory, reads it back, copies it to
`flows/aug-315-export-pdf/pdf/scorecard.pdf`, reads the copy back, and records its
SHA256. Zero/multiple exports, symlinks, truncated bytes, or an existing destination
fail the flow. No share recipient is selected. This verifies local save/reopen;
it does not claim that the iOS Files picker or recipient delivery was tested.

Run the comparator on the preserved artifact using an existing `pdftotext`:

```
node scoresnap/e2e/shared/pdf-scorecard-contract.cjs \
  e2e-out/flows/aug-315-export-pdf/pdf/scorecard.pdf \
  .maestro/fixtures/pdf-settled-round.json
```

It checks exact normalized rows for title/course/date, player names, ordered hole
headers/scores, totals and results. Missing extractor, unreadable file or failed
comparison returns failure. The native collection receipt explicitly keeps
`contentComparison: pending` until this separate automated check runs. Bind the
PDF receipt and comparison result to the native manifest's app source SHA and
build digest before closing AUG-402. A share sheet alone is insufficient evidence.

Focused integration tests drive the real settlement export handler and real PDF
builder, write bytes to disk, reopen with PDFDocument and extract/compare text.
A fresh native font loader resolves the bundled font with network calls forbidden.
Real unsupported CJK and emoji inputs reach the existing error panel without any
local file or share invocation. These are code-level automated proofs, not native
simulator acceptance. Shared setup readiness and an existing compatible offline
simulator app remain prerequisites for runtime execution. No new build or native
run is authorized by this patch. Android remains a non-blocking Tier 3 follow-up.
