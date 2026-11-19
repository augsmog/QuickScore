# device-layout/v1

Reusable device-layout gate extracted from SnapScore's browser capture audit
(AUG-1381, child of AUG-1373). Zero dependencies, Node >= 20, so any product
repo can vendor this directory as-is.

| Piece | File | Notes |
|---|---|---|
| Config schema (device matrix + rules) | `schema/device-layout.v1.schema.json`, `src/config.mjs` | portrait/landscape, per-side safe area, per-device min target (44pt iOS, 48dp Android) |
| Snapshot (adapter output) | `src/rules.mjs` (`device-layout/snapshot/v1`) | rects in logical units, origin top-left |
| Rules | `src/rules.mjs` | `target-size`, `safe-area`, `offscreen`, `control-overlap`, `text-over-control`, `unsupported-geometry` (same semantics as `scoresnap/e2e/journeys/capture-layout.mjs`) |
| Receipt schema | `schema/receipt.v1.schema.json`, `src/gate.mjs` | config sha256 digest, per device×screen results, missing coverage, verdict |
| Waiver format | `schema/waiver.v1.schema.json` | exact rule+subject, `AUG-n` ticket, approver, expiry; **expired waivers fail** |
| Vision rubric | `rubric/vision-rubric.v1.md` | scored by an independent checker; geometry PASS is necessary, not sufficient |

The gate fails closed: zero snapshots, an empty snapshot, an unknown device or
screen, a missing required device×screen pair, or an expired waiver all FAIL.

## Adapters

- **SnapScore** (`adapters/snapscore.mjs`): `fromCaptureAudit(auditCapture(...), {device, screen})` and
  `profileToDevice(id, {width,height,top,bottom})`. Browser measurement stays in `scoresnap/e2e`.
- **Locker Room Defense / Godot 4** (`adapters/godot.mjs` + `adapters/godot/dump_layout.gd`):
  the GDScript walks visible `Control` nodes and writes `device-layout/godot-dump/v1`
  (global rects in canvas units + visible rect). The node adapter converts to device
  points and rejects a dump whose aspect ratio does not match the device (wrong window size).
  Config: `configs/lrd.device-layout.json` (landscape iPhone SE / 15 Pro / iPad mini / Pixel 7).
- **Parents' game** (`adapters/parents-game.mjs`): refuses until AUG-1024 inspects the stack.

## CLI

```sh
node packages/device-layout/bin/device-layout.mjs validate --config configs/lrd.device-layout.json
node packages/device-layout/bin/device-layout.mjs check --config configs/lrd.device-layout.json \
  --adapter godot --snapshots captures/dumps --waivers waivers.json --sha "$GITHUB_SHA" --out receipt.json
```

Exit 0 PASS, 1 FAIL (receipt still written), 2 usage/config error.

## Not in this package yet

- Running `dump_layout.gd` inside LRD's Godot export on Android/iOS (needs Godot + device/simulator CI in the LRD repo).
- Switching SnapScore's existing `capture-layout.mjs` to call `evaluateSnapshot` (today the package is checked for parity against `interactive-target-geometry.mjs` in tests).
