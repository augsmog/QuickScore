> Historical slice notes; see qa/selector-sidecar/COMPOSED.md for current wrapper-free contract.

# Exercised flow port, source-only

Upstream: 5c81df701b8f9fc116d4470c8eb4d2fa82995e45,
qa/native-a690ef23/android/checkpoints.py. Parent reports 26 captures in run
45010771493 attempt2; no screenshots or runtime results are imported as evidence.

exercised_flow.py preserves the ordinary navigation, flattened player/control,
rounds and footer guard functions from that source. Removed old smoke imports,
ADB/capture/save hooks and unidentified-scene capture. Entry now requires a bound
driver. flow_adapter.py supplies strict checkpoint/source/APK/foreground checks
from this restoration slice, wizard lane only. The old generic backend/scale/build
configuration and build scripts are not ported. No flag overrides are introduced.

Run with an independently trusted exact-source Release build and isolated synthetic
emulator already ordinarily on Home:

    python3 -B flow_adapter.py --repo CLEAN_SOURCE --apk EXACT_APK \
      --binding BUILD_BINDING.json --serial emulator-5554 --out NEW_PREFIX

Binding schema is the checkpoint README's four-field schema. This validates
source/APK identities, not an arbitrary producer's honesty; builder attestation
remains required. Every navigation command rechecks identity/foreground; no raw
hierarchy or private value is written. Optional pricing section failures remain
explicitly missing; capture/source failures are fatal. Results never pass native gate.

## Main dependency: selector-only patch plan, not applied

Pinned product main5190 lacks required markers, so this adapter stops BEFORE ADB
at source-selector-contest-scroll. No substitute guessed coordinates/control.
Required exact hooks for exercised semantics:
- contest/new.tsx: contest-scroll on actual ScrollView; contest-footer on fixed
  footer; contest-rounds on actual round chip group; contest-player-${index} on
  each real player card with stable index. Preserve interaction/accessibility
  grouping; do not create larger synthetic tap areas by tagging a container.
- paywall.tsx: paywall-close on the existing Close Pressable.
Existing tournament-toggle, rounds-2/3/4, contest-step-* and continue/start IDs
remain. Add Player uses exact visible + ADD PLAYER with guarded ancestry and roster
progression; no add-player ID or switch-slot geometry change is required by this port.
These additions must be separately reviewed and runtime hierarchy tested; an ID
alone cannot prove flattened/card/visibility geometry on a different binary.

No app files changed. Full ordinary flow on main remains UNRUN/BLOCKED. Real
hierarchy-to-geometry receipt integration is deferred until these source markers
exist; neither synthetic XML controls nor screenshot filenames become a geometry
PASS. Mandatory scale matrix, initialized RN observation, reviewer admission,
keyboard/viewport/full gate and native online Join remain open and separate.

Portable tests include retained upstream scene positives/negative selectors,
reverse steps, hidden/foreign controls, annual-price and disabled-state controls,
and new binding/admission negatives. No full native-flow success is simulated.
