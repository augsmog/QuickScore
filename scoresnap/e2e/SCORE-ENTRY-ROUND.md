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

The native runner now invokes `score-entry-collect.mjs` for score-entry when a
metric profile is selected. It runs19 Maestro phases, captures hierarchy and an
actual simulator screenshot after each phase, and reads completed command traces
for observed score/Next/correction counts. It samples the interior of both native
navigation targets from screenshot pixels and records sample regions/colors/counts
and screenshot SHA256 in contrast sidecars. Missing traces/ids/pixels or incomplete
finalization fail the run. No device execution is performed by the code tests.

Run the existing compatible app with the approved native runner, once per profile:

```
.maestro/scripts/run-ios-sim.sh --app-path /existing/SnapScore.app --build offline \
  --flows aug-325-score-entry --metric-profile small --out small-out
.maestro/scripts/run-ios-sim.sh --app-path /existing/SnapScore.app --build offline \
  --flows aug-325-score-entry --metric-profile large --out large-out
```

Each app must carry SourceCommit.txt; observations use that app source SHA.
`observations.json`, `metrics.json`, phase command traces, JUnit, hierarchies,
screenshots and contrast sidecars are retained. Run without a metric profile
retains the generic capture path and does not produce a measured acceptance report.
The collector preserves failures such as the current compact44pt controls; it does
not change app targets or waive56pt. AUG-387 remains separate native evidence.
