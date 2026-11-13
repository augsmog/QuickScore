# AUG-48 pre-migration launch-readiness snapshot (AUG-1114)

- Read against `augsmog/QuickScore` main at `d566d57f8640abf5c30137d83ee051431b028379` (committed 2026-11-12 21:54 -0800).
- Source checklist: AUG-48 child list (Linear read, 2026-11-13), cross-checked with AUG-576 / AUG-664 (both Done).
- Read-only. No App Store Connect access, no Linear writes, no held row started.
- CI on that SHA (GitHub Actions, `gh run list`): Schema drift, Tournament E2E, Web smoke, Pro shipping config guard, iOS boot smoke all `success`.
- Limit: Linear status is as read today. ASC state was not re-read; ASC claims below come from the ticket text (Oct 31 read-back), not fresh evidence.

Classes: **Done** / **OPEN-BOT** (bot-doable, still open) / **HELD** (migration or owner; classified only).

| AUG | Row | Linear status | Class | Evidence / ticket to reuse |
|---|---|---|---|---|
| 49 | Cut Build 27 approved | Done | Done | Linear Done. `scoresnap/app.json` on main still shows `buildNumber` "1" (the ASC build number is set by EAS, so this is not a contradiction; not verified here). |
| 52 | Listing copy + 50+ line | Done | Done | Linear Done |
| 53 | App name "SnapScore Golf" | Done | Done | Linear Done |
| 54 | 50+ claim (57 modes) | Done | Done | Linear Done (Build 26 count; not recounted on main) |
| 55 | Categories | Done | Done | Linear Done |
| 56 | Age rating | Done | Done | Linear Done |
| 57 | Export compliance | Done | Done | Linear Done |
| 58 | Price Free | Done | Done | Linear Done. Any $5 price work is HELD. |
| 59 | Storefronts (173) | Done | Done | Linear Done |
| 60 | Build 26 attached | Done | Done | Linear Done |
| 61 | Release automatically | Done | Done | Linear Done |
| 62 | 4 subscriptions Ready to Submit | Done | Done | Linear Done |
| 64 | Privacy labels + policy URL | Done | Done | Linear Done |
| 66 | Build 27 attached to 1.0 | Done | Done | Linear Done |
| 77 | Chat Report/Block/word filter | Done | Done | `scoresnap/src/services/chat-moderation-model.ts`, `scoresnap/src/ui/ChatModeration.tsx` present on main |
| 79 | Content rights answer | Done | Done | Linear Done |
| 242 | Home "See All" game modes | Done | Done | Linear Done |
| 263 | Shared round share state after reload | Done | Done | Linear Done |
| 349 | Make QuickScore private | Done | **Discrepancy** | `gh repo view` reports `PUBLIC` today. Linear says Done. Either privacy is intentionally deferred to go-live or the readback is stale. Needs a human or box lane to confirm. No ticket to reuse: AUG-349 is Done and should not be reopened by this lane. |
| 576 / 664 | Earlier snapshots | Done | Done | Superseded by this doc |
| 623 / 627 | Privacy docs PR #31 | Done | Done | Linear Done |
| 51 | Board page shows tasks (PR #78) | Todo, paused, blocked | HELD (paused/blocked) | Do not unhold. Reuse AUG-51 when its blocker clears. |
| 67 | App Review notes + demo login in ASC | Todo, blocked | HELD (ASC write + AUG-50 contact) | Writes to ASC; reuse AUG-67. Not started. |
| 68 | Attach subscriptions + Submit | Todo, blocked | HELD (submit; depends on AUG-76/50/65) | Reuse AUG-68. No submit. |
| 78 | Demo review account + sample round in prod | Todo, blocked | HELD (blocked) | Reuse AUG-78. Do not unhold. |
| 81 | Bot multi-device 4-player test | Todo, blocked | HELD (blocked) | Reuse AUG-81. Do not unhold. |
| 259 | Guest join: anonymous sign-ins disabled in live Supabase | Todo, blocked | HELD (blocked, live Supabase setting) | Main calls `signInAnonymously` at `scoresnap/src/services/cross-device.ts:84` and has `scoresnap/docs/CAPTCHA.md` notes. The live setting was not read. Reuse AUG-259. |
| 50 | App Review contact phone | Todo, needs-augie | HELD (owner) | Not started |
| 65 | Screenshots from real build | Todo, needs-augie | HELD (owner) | Not started |
| 76 | Paid Apps / tax / banking | Todo, blocked | HELD (Apple account migration) | Not started |
| 1037 / 1038 / 1041 | Associated Domains / AASA / $5 price | not in AUG-48 children | HELD | Classified only. These ids were not read; the HELD class comes from the AUG-1114 text. |

## Summary

- Done: 22 tickets (AUG-349 counted separately as a discrepancy). Open-bot-doable: **0** with an existing unblocked ticket.
- Every remaining open row is blocked, paused, needs-augie, or tied to the Apple migration. None was unheld.
- One discrepancy for a checker/owner: repo visibility (AUG-349 Done vs PUBLIC today).
- No bot-doable row lacks a ticket. No new ticket is proposed (and this lane cannot create one).
