# a073 compact continuation (unrun native)

Parent harness: 9fafee98846da956f2d921ed31e6789e856e41e5.
Frozen app: a073d5761b77f3e01610acebaf5d98f76a920fb5,
tree 3cbda6ddde720b614c0ae3c2bccef7948d805e20.

The existing trusted manual Android entrypoint remains the only runner intake:
`bash scoresnap/e2e/device-layout/scripts/run-android-compact.sh`, with the
existing workflow's DEVICE_LAYOUT_OUT and exact repository/workflow/ref guard.
No dispatch or publication is authorized by this local packet. No new tools are
required: adb/UIAutomator are already used by the working Home smoke. Existing
Release build, isolated dependency environment, APK install/readback, scale loop,
and original-scale restoration are unchanged. Home screenshots are retained.

After each Home checkpoint, the continuation uses actual visible control bounds
to tap/scroll. It enters Join through home-join-code, fills synthetic AAAAAA and
QAGuest, and observes the local-not-found error. It then enters New Contest,
requires the actual Golfer prefill, enters QAGuest, adds/fills QAThree and QAFour,
captures setup, enables Multi-Day, captures rounds with NUMBER OF ROUNDS and all
three choices, reaches Add Player at the scroll end, continues through games and
round settings, and taps Start. No contest is persisted: the free TD gate opens
the fallback paywall first. Default stroke play and defaultCourse('My Course')
are source-supported; no seeded course or selected tee is required.

Paywall top is required. Free + Current plan, Tournament Director + $79.99/year,
and explicitly disabled Currently unavailable + renewal copy are separately
screened optional sections. If exact accessibility labels/disabled state cannot
be safely observed, the section is marked unavailable; no screenshot is accepted
for it. Only ordinary scrolling and the actual Close button are used. Close must
return to round settings, and ordinary Back must retain all four player names
and the tournament rounds UI. Buy, Restore, links and tier controls are never
tapped. No provider keys are inherited. This is fallback catalog evidence only.

Rules: scoresnap/e2e/device-layout/lib/vision-rubric.md rule 2 is last-row/footer
clipping and reachability (ordinary scroll-edge fragments alone are not defects).
Rule 7 is state legibility/affordance, including hidden actions and misleading
disabled states. geometry-rules.mjs implements clipping and a contrast hook;
accessibility rectangles do not establish painted glyph geometry or contrast.
Each screenshot still needs actual pixel review. Receipts deliberately leave
geometryPassed/nativeAcceptance/aggregatePass false and runtimeRNScale null.

Every capture reuses exact clean source, Release manifest and installed APK byte
checks, target focus/default display, resumed Activity, Settings/config agreement,
before/after Activity identity and 15-second freshness checks. Continuation scenes
have strict visible markers, foreign-scene exclusions and no Home substitution.
Only synthetic controls, bounded phase names and observed bounds are recorded;
raw XML, dumpsys, device identities and tool stderr are not written to receipts.
Bounds in continuation.json are sampled before capture, not painted-text metrics.

Online limit is exact: cross-device.ts defines onlineEnabled as sharing flag AND
REAL_AUTH_CONFIGURED; the isolated offline build has no backend URL/key. The Join
route therefore uses localContestJoinService. These entry/error captures cannot
prove ordinary online host approval, player binding, score convergence/reconnect.
That requires a separately authorized isolated backend and two native clients.
The previously observed APK cleartext default is false; do not assume HTTP reachability.

Portable validation: `bash qa/native-a690ef23/check.sh`; Actions deterministic
parity: from scoresnap/e2e/device-layout, `node --test lib/*.test.mjs`.
Synthetic XML/command controls are not native evidence. On this cloud executor,
adb and emulator are absent. Actual Android navigation, accessibility surface,
screenshots, price visibility and draft restoration remain UNRUN. iPhone is untouched.
