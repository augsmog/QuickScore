# App Review reply kit — SnapScore

Read-only assembly guide for the five likely App Review questions. This file does not authorize or perform an App Store Connect edit or reply.

## 1. Working demo account

**Draft answer:** Sign in with the demo account entered in App Review Information. The demo account has Pro and Tournament Director access for review.

Draft: `/workspace/aos-state/reports/build31-appreview-packet-20261109.md#L45-L45`
Evidence: `/workspace/aos-state/reports/build31-appreview-packet-20261109.md#L61-L61` (`AUG-67`) (observed and unverified paths are distinguished there; credentials are intentionally not stored in this kit).

## 2. Subscription restoration

**Draft answer:** To view subscription options, open Profile and choose Upgrade. The paywall includes subscription information, Restore Purchases, and links to the Terms of Use and Privacy Policy.

Draft: `/workspace/aos-state/reports/build31-appreview-packet-20261109.md#L49-L49`
Evidence: `/workspace/aos-state/reports/build31-appreview-packet-20261109.md#L64-L64` (`AUG-67`) (native verification is still unverified).

## 3. EULA, Terms, and Privacy links

**Draft answer:** The paywall includes links to the Terms of Use and Privacy Policy.

Draft: `/workspace/aos-state/reports/build31-appreview-packet-20261109.md#L49-L49`
Evidence: `/workspace/aos-state/reports/build31-appreview-packet-20261109.md#L49-L49` (`AUG-67`) (the packet records the link wording; native verification remains pending).

## 4. Reporting or blocking a user

**Draft answer:** In a shared round, long-press a chat message to report it or block its sender.

Draft: `/workspace/aos-state/reports/build31-appreview-packet-20261109.md#L51-L51`
Evidence: `/workspace/aos-state/reports/build31-appreview-packet-20261109.md#L66-L67` (`AUG-67`) (unverified on Build 31).

## 5. Settlement behavior

**Draft answer:** The Settle Up screen calculates amounts from entered scores. The app does not transfer funds or process payments between players; arrangements take place outside the app.

Draft: `/workspace/aos-state/reports/build31-appreview-packet-20261109.md#L43-L43`
Evidence: `/workspace/aos-state/snapscore/review-notes-draft-20261031.md#L8-L8` (`AUG-67`).

## Current unknowns and checks

- `UNKNOWN` — the packet’s “50+ game modes” claim at `/workspace/aos-state/reports/build31-appreview-packet-20261109.md#L41-L41` conflicts with the shipped-count record, which reports 33 selectable and scored end to end. `AUG-296` must resolve which source/count is authoritative before this claim can be verified. The deterministic check fails closed on this mismatch.
- `UNKNOWN` — native verification remains outstanding for demo sign-in, Restore Purchases, and report/block paths; see `AUG-67` and the packet’s path table.

Run from `/workspace/aos-state`: `python3 snapscore/reply-kit-20261109/check_reply_kit.py` and `python3 snapscore/reply-kit-20261109/test_check_reply_kit.py`.
