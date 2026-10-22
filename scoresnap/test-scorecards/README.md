# Synthetic scorecard corpus

79 labeled JSON fixtures; no photos, personal data, cloud calls or live OCR. Run:

```sh
npm test -- --runInBand tests/scorecard-corpus.test.cjs
```

Each fixture has a unique `id`, category, `text` or `grid`, and an independent `expected` parse (names, 18-slot scores, par and hole count). Empty/malformed fixtures label the UI error in `expectedError`; the parser itself returns no players. All fixtures assert desired behavior as normal passing tests. See `docs/QA_FINDINGS.md`.

Coverage: clean 9/18-hole cards, all-4s, CSV/tab/multiple-space separators, CR/LF/CRLF, missing/invalid holes, partial rounds, OCR character substitutions and confidence, OUT/IN/totals, extra columns, names, empty/malformed input. Each fixture also passes through ML Kit's existing geometry builder via a mocked recognition result: reversed elements, row jitter, frameless elements. This exercises the real builder without exposing it or requiring a native runtime. Geometry parity is a wiring check, not independent parser truth or real handwriting/device acceptance.
