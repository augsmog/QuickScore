# Journey reach depth

Device profile: iphone-pro-max (430×932; bottom inset 34px).
Source SHA: c3f3a0fc76f12c1bdd71733407f5eda230b48372.

| Journey | Persona | Start | Feature | Taps from start | Scrolls | Above fold | Named | Budget | Position (x, y, w, h) | Result |
|---|---|---|---|---:|---:|---|---|---:|---|---|
| J-home-create-cancel | New golfer | home | create (New Contest) | 1 | 0 | yes | yes | 2 taps / 0 scrolls | 20, 166, 390, 52 | passed |
| J-home-join-code-error | New golfer | home | join (Join with code) | 1 | 0 | yes | yes | 2 taps / 0 scrolls | 221, 230, 189, 52 | passed |
| J-round-score-settle-reload | Round organizer | round | score-Augie (Set Augie score to par) | 1 | 0 | yes | yes | 2 taps / 0 scrolls | 172, 476, 90, 63 | passed |
| J-round-score-settle-reload | Round organizer | round | score-Sam (Set Sam score to par) | 1 | 0 | yes | yes | 2 taps / 0 scrolls | 172, 622, 90, 63 | passed |
| J-round-score-settle-reload | Round organizer | round | settle (Settlement) | 1 | 0 | yes | yes | 2 taps / 0 scrolls | 311, 278, 96, 44 | passed |
| J-round-score-settle-reload | Round organizer | round | leaderboard (Leaderboard) | 2 | 0 | yes | yes | 2 taps / 0 scrolls | 120, 278, 96, 44 | passed |
| J-invite-from-round | Round organizer | round | invite (Invite players) | 1 | 0 | yes | yes | 2 taps / 0 scrolls | 20, 112, 390, 44 | passed |
| J-delete-account | Synthetic offline account | home | delete-account (Delete Account) | 3 | 0 | yes | yes | 3 taps / 1 scrolls | 16, 197, 398, 65 | passed |
| J-game-rules | New golfer | home | game-library (See all game modes) | 1 | 0 | yes | yes | 1 taps / 0 scrolls | 366, 310, 44, 44 | passed |
| J-game-rules | New golfer | home | skins-rules (Skins) | 2 | 1 | no | yes | 2 taps / 1 scrolls | 20, 192, 390, 80 | passed |

Unmeasured features: 0.
“Above fold” means the feature was reached with zero scrolls and the full control rectangle ends before the simulated home-indicator inset. “Named” reflects the journey runner exact-role/name check; known issues remain explicit expected failures.
