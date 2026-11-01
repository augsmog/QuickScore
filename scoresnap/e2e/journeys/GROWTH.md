# Journey growth ledger

Append only. Owner is the accountable adapter team; issue closure requires removing its strict marker and preserving the assertion. Deferred rows identify coverage gaps rather than executable evidence.

| Date | Journey id | Behaviour | Origin | Executable assertion | Owner | Issue |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-31 | J-home-create-cancel | Open create, edit a name, cancel to Home without creating a contest | PM seed / phase 1 cut | entry, activation, destination, outcome | SnapScore maintainers | AUG-288 |
| 2026-10-31 | J-home-join-code-error | Enter an invalid join code, see an error, dismiss to Home | PM seed / phase 1 cut | entry, activation, destination, invalid-code-error, outcome | SnapScore maintainers | AUG-288 |
| 2026-10-31 | J-round-score-settle-reload | Score hole 1 for both players, reach Settlement and Leaderboard, reload with scores unchanged | PM seed / phase 1 cut | entry, activation, destination, leaderboard-totals, outcome | SnapScore maintainers | AUG-288 |
| 2026-10-31 | J-invite-from-round | Find the above-fold local invite, copy it, and verify its join URL | PM seed / phase 1 cut | entry, code-visible, activation, destination, outcome | SnapScore maintainers | AUG-288 |
| 2026-10-31 | J-finalize-settle | Request finalize, see confirmation, cancel without locking scores | PM seed / phase 1 cut | entry, activation, finalize confirm dialog not rendered, outcome | SnapScore maintainers | AUG-289 |
| 2026-10-31 | J-score-hand | Score a full 18 by hand | PM seed / phase 1 cut | GAP: AUG-291: full-18 navigation cost; phase 1 gates hole 1 only | SnapScore maintainers | AUG-291 |
| 2026-10-31 | J-delete-account | Reach and cancel Delete account | PM seed / phase 1 cut | GAP: AUG-292: Settings below fold and unnamed rows; account deletion adapter deferred | SnapScore maintainers | AUG-292 |
| 2026-10-31 | J-free-paywall-recover | Recover form intact after selecting a paid option | PM seed / phase 1 cut | GAP: AUG-293: double paywall; form/paywall adapter deferred | SnapScore maintainers | AUG-293 |
| 2026-10-31 | J-create-8p-multiday | Create an 8-player 2-round 2-group tournament | PM seed / phase 1 cut | GAP: Multiday creation outside the phase 1 slice | SnapScore maintainers | AUG-288 |
| 2026-10-31 | J-join-code | Successfully join a contest with a code | PM seed / phase 1 cut | GAP: Offline error path does not prove successful backend or cross-device join | SnapScore maintainers | AUG-288 |
| 2026-10-31 | J-guest-join-web | Join from a guest shared link | PM seed / phase 1 cut | GAP: Guest identity and backend joining deferred; existing sharing suites retained | SnapScore maintainers | AUG-288 |
| 2026-10-31 | J-reopen-after-crash | Recover a round after a process crash | PM seed / phase 1 cut | GAP: Reload persistence is gated; process kill/crash recovery is separate coverage | SnapScore maintainers | AUG-288 |
| 2026-10-31 | J-game-rules | Find the rules for a game from Home | PM seed / phase 1 cut | GAP: Rules discovery adapter deferred to next phase | SnapScore maintainers | AUG-288 |
| 2026-10-31 | J-finalize-settle | Web finalize confirmation must render before locking scores | Pressure-test audit | Strict xfail: finalize confirm dialog not rendered | SnapScore maintainers | AUG-289 |
| 2026-10-31 | J-invite-from-round | Invite must be above fold and named | Reachability audit | Copy outcome gated; no-accessible-name strict feature xfail | SnapScore maintainers | AUG-290 / AUG-306 |
| 2026-10-31 | J-score-hand | Complete 18 holes without excessive navigation | Usability audit | GAP: full-18 adapter deferred; hole-1 persistence is executable | SnapScore maintainers | AUG-291 |
| 2026-10-31 | J-delete-account | Reach named Settings and Delete account | App Review / reachability audit | GAP: Settings below fold / unnamed rows; deletion adapter deferred | SnapScore maintainers | AUG-292 |
| 2026-10-31 | J-free-paywall-recover | Return from paid option without a second paywall or lost form | Usability audit | GAP: double-paywall recovery adapter deferred | SnapScore maintainers | AUG-293 |
| 2026-10-31 | J-round-score-settle-reload | Score and settle controls require exact accessible names | Main bce5673 acceptance walk | Exact no-accessible-name xfails; viewport/hit-test and scores/settle/reload stay gated | SnapScore maintainers | AUG-306 |
| 2026-10-31 | J-home-create-cancel | Core label must remain rendered through intermediate ancestors and contrast with its background | Verifier round 1 / fix round 1 | visible-text-missing for hide-label and transparent-label negative proofs | SnapScore maintainers | AUG-288 |
| 2026-10-31 | J-home-create-cancel | Core label clipping and effective text fill must remain visible | Verifier round 2 / fix round 2 | Range geometry through all clipping ancestors, text-fill paint, and clipped-pixel proof; negative proofs `label-overflow-clipped`, `label-clip-path`, `text-fill-transparent` | SnapScore maintainers | AUG-288 |
| 2026-10-31 | All executable journeys | Every required step must produce a screenshot in the current attempt | Verifier round 1 follow-up | requiredSteps inventory; missing step capture is red even with passing outcomes or a strict xfail | SnapScore maintainers | AUG-288 |

| 2026-11-01 | J-home-create-cancel and core-label checks | Glyph paint under patterned covers | AUG-330 / PR #86 independent round 3 | `proveGlyphPaint`, rendered fixture tests, and striped sibling / `::after` / currentColor / partial-cover / two-pixel-sliver negative proofs; execution status in EVIDENCE.md | SnapScore maintainers | AUG-330 |
