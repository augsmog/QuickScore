# Layout gate triage: 41bad54, iPhone 16 Pro (local run)

Run: `scoresnap/e2e/device-layout/scripts/run-ios-sim.sh` at 41bad54e5f004f2725361a8717ad2698768f2a1e on the Mac mini,
the same steps as the `ios-sim` job in `.github/workflows/device-layout-gate.yml`, with these differences:
- only the `iphone-16-pro` profile
- `LANG=C.UTF-8`, the runner's value
- a separate `DEVICE_LAYOUT_CACHE`
- no vision review, because no reviewer credential is on the Mac

App files are identical to the frozen candidate fd714e2. The cold build passed (`xcodebuild` took 330s); the whole run took 1141s.
Result: GEOMETRY GATE FAIL, 105 kept findings (rule 2: 61, rule 5: 44). The large-text pass had 16 findings, but only 2 of its
12 checkpoints were captured, so that result is unreliable.

## Cause of the 105 findings

Every finding is a 44pt control whose frame lies partly or wholly outside its measured scroll viewport.
The viewport runs from y=142 to y=750 (y=541 while the keyboard is up). The sticky footer starts at y=762 on the 874pt screen.

- Rule 2 (61): 46 are "Required/control frame is not fully painted within measured scroll ancestors; reachability unproven".
  The other 15 are specific forms of the same state:
  - 8 labels "hard-clipped by the sticky footer": "0" x3, "A" x2, "B" x2, "Ava" x1 (7-25pt behind it)
  - 7 "extends outside the safe area / viewport": "Add group" x2, and "0", "A", "B", "Remove player", wizard-player-name-3 once each
- Rule 5 (44): "Measured scroll clipping leaves an undersized painted target". These are the same frames as the rule 2
  findings: the painted part of a scrolled-off control is less than 44pt.

## Why these are capture/tooling artefacts, not app defects

- The frames are in normal resting positions of a scrolling list. Some have scrolled above the window under the header,
  for example team-mode 4-48 and wizard-player-name-1 23-67. Others rest in the fade just above the footer, for example
  player-handicap 728-772 and wizard-player-name-2 709-753. Some sit below the screen, for example add-group 857-901.
  All of them are reachable by scrolling. The screenshots show no control overlapped or cut while visible at rest.
- 41bad54 does not have the G1 same-state reveal steps (DotBot g1-early-same-state-reveal-v5, branch
  claude/dotbot-g1-early-reveal-v5). Without them the gate has no proof that these controls can be reached, so it reports
  each scrolled-off control as a finding.
- Name entry: the keyboard covers the controls below Ava's row, so the window is 142-541. This is the case the G3
  keyboard-mask change (claude/dotbot-g3-keyboard-mask) scores correctly.

## Capture faults (tooling, not app)

1. Stale output scored for a timed-out flow. `.maestro/flows/device-layout-ios/new-contest/09-four-players-add-group.yaml`
   timed out after 150s ("missing named wizard screenshot: device-layout-new-contest-09-four-players-add-group").
   Checkpoint `10-new-contest-four-players-add-group` still produced a hierarchy and 10 findings. They are identical, box for
   box, to `08-new-contest-last-player-above-footer`, so the gate scored the screen left over from the previous step.
2. Not scrolled. `.maestro/flows/device-layout/new-contest/04-rounds-4-scrolled.yaml` leaves the screen at rest: checkpoint
   `05-new-contest-rounds-4-scrolled` has the same frames and findings as `04-new-contest-rounds-3`, and the screenshot is
   unscrolled.

## Per checkpoint (findings; V1 = band between sheet top and header; V2 = card at the Continue footer)

| Checkpoint | Findings | V1 | V2 |
|---|---|---|---|
| join entry | 0 | n/a | n/a |
| empty wizard | 6 | about 7pt from sheet top to back button; no band | Player 2 card fades into the footer |
| name entry | 8 | no band | keyboard up; footer area hidden |
| multi-day on | 4 | no band | Player 2 card fades |
| rounds 3 | 4 | no band | Player 2 card fades |
| rounds 4 scrolled | 4 | no band | Player 2 card fades (not scrolled; see fault 2) |
| team mode on | 9 | no band | Players section fades |
| four players | 15 | no band | card 4's HCP row fades over about 25pt and ends in a faint straight edge just above Continue |
| last player above footer | 10 | no band | everything sits above the footer |
| rewind remove Ava | 35 | no band | Player 2 card fades; round chips scrolled under the header (normal) |
| four players add group | 10 | no screenshot | stale (see fault 1) |
| paywall tier td | 0 | n/a | n/a |

The sheet's top edge sits at about 65pt (iPhone 16 Pro, 402x874pt), just under the status bar.

Other things visible in the screenshots:
- The Team Mode and Multi-Day toggles have a very low-contrast off state (white knob, near-invisible track).
- No overlapping controls or undersized visible targets.
