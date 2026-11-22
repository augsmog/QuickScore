> Historical slice notes; see qa/selector-sidecar/COMPOSED.md for current wrapper-free contract.

# Identifier-only sidecar (partial by design)
Base main: 5190f43261a42f108d54627c793d5be64046c840.
Companion private navigation: e737cc110566b5db6d6b2a2b42131c95fc366710.

Added hooks, no new containers, styles, callbacks, accessibility copy or flags:
- contest-scroll: existing native ScrollView.
- contest-footer: existing View drawing COLORS.bg behind navigation.
- contest-player-${idx}: existing card View drawing background and 1px border.
- paywall-close: existing interactive Close Pressable with router.back handler.
Existing IDs are preserved. Native hierarchy/accessibility equivalence is UNRUN;
static tests prove exact original source recovery when these four insertions are
removed, not native runtime equivalence.

STOPPED hook: contest-rounds. Existing outer View has only marginBottom/paddingLeft;
inner View only flexDirection/gap. Neither is demonstrably materialized. React Native
View testID documentation states that it disables layout-only view removal:
https://reactnative.dev/docs/0.81/view#testid
Tagging either changes that optimization; tagging the heading instead does not
contain the choices required by the exercised tournament_controls guard. No ID,
collapsable override, synthetic wrapper or guard relaxation is applied here.
Actual companion preflight advances from contest-scroll to contest-rounds and
fails before ADB. A full preflight PASS is intentionally not claimed.

Next bounded decision: explicitly review materialization of this rounds container,
or adapt its geometry observer to independently verify existing heading/chip bounds
without claiming a container. Then build exact combined source with trusted recipe,
bind source/tree/recipe/APK plus installed-byte readback, and connect the captured
hierarchy/density to converter and image hash in one receipt. Scale/reviewer/native
Join admission remain separate. No workflow/runner/store settings changes.

Tests: python3 -B -m unittest discover -s qa/selector-sidecar -v
