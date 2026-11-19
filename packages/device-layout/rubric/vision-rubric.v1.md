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

Output: append `{"rubric":"device-layout/vision-rubric/v1","by":"<checker>","verdict":"PASS|FAIL","signatures":[...]}`
to the PR evidence; do not edit the receipt.
