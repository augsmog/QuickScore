# Android geometry output (partial, executable)

Parent c7ba3a7c06b752d691b4bd021ec0a0543e29ecf7; main readback
5190f43261a42f108d54627c793d5be64046c840. No app, workflow, config,
waiver, or rule changes in this increment.

The existing run-android-compact.sh -> gate_android.py now retains a sanitized
projection of the exact hierarchy whose bytes matched before/after the PNG.
Projection preserves raw bounds, ancestry, interactive/state flags, and only
allowlisted app resource IDs; text values, descriptions and package data are not
retained. Text presence gives a role, NOT measured text or truncation proof.
The raw hierarchy hash, projection hash, PNG hash, boot identity hash, source/tree,
installed APK, run/attempt/job, measured density/viewport, OS settings and current
Activity scale are bound. No claim of initialized React Native scale.

After capture (including partial failure), geometry_output.mjs writes:
  geometry/android-compact/bundle.json
  geometry/android-compact/geometry.json
  geometry/android-compact-large-text/bundle.json
  geometry/android-compact-large-text/geometry.json
  geometry-result.json
PNG references are lane-relative. Both files are literally bundle.json for the
unchanged downstream discovery path. Each lane invokes the REAL run-geometry.mjs
with exact source, APK and profile, default config and full per-pr requirements.
No --cadence none, fake-complete fixture or substituted validator is used.

Only source-proven scene mappings are admitted: setup-initial -> empty wizard;
rounds -> multi-day on; players-end -> last player above footer. Other actually
captured scenes remain supplemental; a pricing fragment is not plan-card/restore
proof, 4 players are not 8-player stress, and offline Home is not online Join.
All required checkpoints are copied from the unmodified config to the typed
receipt; omitted requirements produce actual rule-8 validation errors.

Safe-area provider is now implemented for a strict API35 full-screen subset; see
INSETS_PROVIDER.md. Native readback remains unrun. Missing/unsupported providers
still fail, while the positive portable path now reaches the unchanged schema
without a missing-safeArea error. Required scene/keyboard/text/RN/reviewer gaps
remain explicit and no gate acceptance is inferred.

Portable replay (no ADB/build/native run):
  python3 -B -m unittest discover -s scoresnap/e2e/device-layout/scripts/checkpoint -p 'test_*.py'
  node --test scoresnap/e2e/device-layout/scripts/checkpoint/geometry_output.test.mjs
  node --test scoresnap/e2e/device-layout/lib/*.test.mjs
Controls use clearly synthetic valid PNG bytes and hierarchy frames. They verify
both scale conversions, exact dp frames, no retained text, foreign/entity rejection,
stale source/tree/APK/job/observation/image/projection rejection, and invoke the
real CLI to prove both partial lanes stay red with missing-measurement/flow errors.
No synthetic fixture is emitted as a real native result.
