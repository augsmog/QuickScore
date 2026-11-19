# Screen coverage gate (AUG-1373)

A review gap behind AUG-1367/AUG-1368/AUG-1369 was that layout regressions landed on
SnapScore screens with no gate forcing native visual acceptance per screen. This directory
holds the **release-bound route/state coverage registry** and the per-PR gate that keeps it
honest, so native visual coverage can never silently regress.

## Files
- `coverage-manifest.json` — the registry. Every route file under `scoresnap/app/**` is
  listed and classified.
- `../../scripts/check-screen-coverage.mjs` — the gate. Discovers route files, cross-checks
  the manifest, exits non-zero on any gap/inconsistency.
- `../../scripts/check-screen-coverage.test.mjs` — `node --test` unit suite for the gate.
- `../../../.github/workflows/screen-coverage-gate.yml` — runs the suite + the gate on any PR
  touching `scoresnap/app/**` or the manifest.

Run locally: `npm run coverage:screens` and `npm run test:screen-coverage` (from `scoresnap/`).

## Manifest entry kinds
- `screen` — a visual route. Requires `name` and `coverage`:
  - `pending` — native visual acceptance not yet captured; must name a `trackedBy` ticket
    (the native screenshot/assertion gate, **AUG-1376**).
  - `covered` — native visual acceptance landed. Must list `flows` (ids defined in
    `.maestro/e2e.config.json`), `screenshots`, every id in `releaseGate.requiredDeviceIds`,
    and `assertions` drawn from `releaseGate.assertionClasses`.
- `layout` / `special` / `dev` — non-visual files, exempt with a `reason`.

## What fails the gate
- A route file on disk that is **not** in the manifest (new screen added without registering).
- A manifest entry whose file no longer exists (stale).
- A `covered` claim missing real flow/screenshot/device/assertion evidence, or referencing a
  flow id that is not defined in the maestro config.
- A `pending` screen with no `trackedBy`, or a non-visual file with no `reason`.

## Promoting a screen to `covered`
The native screenshot + geometry-assertion execution (393×852 iPhone 15 Pro, 402×874
iPhone 16 Plus) is built on **AUG-1376**. As each screen's native flow + assertions land there,
flip its manifest entry from `pending` to `covered` with the real `flows`/`screenshots` ids —
the gate then enforces that the evidence references are valid.
