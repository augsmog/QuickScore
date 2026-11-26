# device-layout/vision-rubric/v1

Scored by an **independent checker** (never the builder) against the screenshots
listed in a `device-layout/receipt/v1`. Geometry PASS is necessary, not sufficient.
Each item is PASS / FAIL with a one-line failure signature
(`<device>/<screen>: <item id> — <what is wrong>`). Any FAIL fails the screen.

| id | check |
|---|---|
| V1 clipped | No text, icon or control is cut off by the screen edge, notch, Dynamic Island, home indicator, or a camera cutout. |
| V2 overlap | No text sits on top of other text or a control it does not belong to; no control is hidden under another. |
| V3 legible | Body text is readable at device size; no truncation that hides meaning (e.g. "Sta…" for "Start"). |
| V4 contrast | Text and icons are clearly distinguishable from their background (dark-on-dark / light-on-light fails). |
| V5 reachable | Primary actions are visible without scrolling, or an obvious scroll affordance exists. |
| V6 orientation | The screen is drawn in the product's orientation (portrait SnapScore, landscape LRD) with no letterbox gaps or stretched art. |
| V7 consistent | Same screen looks intentionally the same across devices in the matrix (no element missing on one device). |
| V8 state | The screenshot shows the declared screen/state, not a loading spinner, error, or blank frame. |

## Mapping to the AUG-1373 numbered rules

Findings are reported against the AUG-1373 rule numbers: 1 overlap (V2), 2 clipping /
reachability (V1, V5), 3 truncation / context (V3), 4 spacing / alignment and dead space
(V7), 5 tap targets, 6 alignment / indent detail, 7 state legibility / affordance (V4,
e.g. a toggle rendering as an unlabeled black pill), 8 flow completion (V8). V6
(orientation) is reported as rule 2. Also answer: would a new user find this broken?

## Output (machine-checked)

One `device-layout/vision-review/v1` record per screenshot
(`schema/vision-review.v1.schema.json`, validated by `src/vision.mjs`): `sourceSha`,
`buildHash`, `artifactHash` (sha256 of the PNG), `device`, `flow`, `checkpoint`,
`reviewer {provider, model, effort: "high"}`, `findings [{rule 1-8, severity
critical|major|minor, bbox [x,y,w,h], reason}]`, `verdict pass|fail`.

`evaluateVision()` blocks on any critical/major finding, a missing required checkpoint,
an invalid or wrong-head record, a reviewer from the builder's provider (cross-company
rule) or Grok, and **rubric drift**: every run must include the immutable negative
fixtures (owner build-32 `multi-day.png`, `team-mode.png`, marked `"fixture":"negative"`)
and each must come back with at least one major/critical finding, or the gate fails
itself. Positive fixtures (`"fixture":"positive"`) that get rejected also fail it
(over-rejection). Minor findings are non-blocking follow-ups. Do not edit the receipt.
