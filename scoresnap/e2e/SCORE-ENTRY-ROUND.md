# Full-round score-entry evidence contract (Refs AUG-1278 / AUG-387)

The Maestro score-entry flow now visits and screenshots all 18 holes, enters both
players' scores, and confirms finalization. There are no optional Next taps.
Run existing approved simulator automation separately with `--metric-profile small`
and `--metric-profile large`; the native runner records the selected profile and
device in its manifest. The profiles select iPhone SE (3rd generation) and
 iPhone 16 Pro Max respectively. A compatible source-mapped offline app and shared
setup readiness remain prerequisites. This change does not authorize a build or run.

`node scoresnap/e2e/score-entry-round.mjs observations.json` validates one measured
run and emits a report (exit 1 for invalid/missing observations). Input schema:

- `schema`: `snapscore-score-entry/1`; `sourceSha`: app source commit (40 hex);
  `runId`: automated run identifier; `profile`: small or large; `device`: model;
  `viewport`: width/height in points. Small width <=375; large width >=430.
- `holes`: exactly 18 ordered observations, each with `hole`, observed integer
  `taps` and `corrections`, `screenshot` and `hierarchy` artifact references.
- Each hole has `targets`: minus/par/plus for Ava and Ben plus previous/next,
  each with `id`, x/y/width/height in points, all within the viewport and >=56pt.
- `navigation`: `previousVisible`, `nextVisible`, and observed `nextOutcome`
  (next hole 2..18, or remaining on 18 at the boundary).
- `contrast`: screenshot-sampled `foreground`/`background` in #RRGGBB,
  `method: screenshot-sampled`, and `artifact` reference documenting the sample
  coordinates/regions. Text contrast must be >=4.5. Source color tokens do not pass.
- `finalized: true` plus `finalizeArtifact` documenting the completed state.

The test receipts are synthetic contract tests, never runtime acceptance evidence.
Command counts from YAML cannot supply observed tap/correction counts. A schema
pass alone does not prove that artifact references exist or match a simulator run;
the independent E2E verifier must bind them to the manifest and actual artifacts.
Both profiles must have the same app source SHA before AUG-387 can close.

Remaining integration work for AUG-1278: the native runner currently captures one
hierarchy at flow end. It still needs per-hole measured hierarchy, observed action
counts and screenshot contrast sampling to produce the observation input above.
The validator fails closed until that collector supplies complete measurements;
this patch is partial harness progress and does not close AUG-1278 or AUG-387.
