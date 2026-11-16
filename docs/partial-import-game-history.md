# Partial-import game history reconciliation (Refs AUG-1168 / AUG-348)

PR273 is the canonical unmounted candidate. PR274 is an alternate, not a dependency;
its helper must not be mounted alongside this model. Retain PR274 as draft until the
canonical candidate passes independent review and merges; then close the superseded
candidate without merging its parallel authority.

Compared against AuxiliaryData in src/engine/types.ts and the five Tier2Game kinds
in app/scan/game-details.tsx. The canonical model retains PR274's played-hole filtering,
existing-answer reuse (including null greenie, empty snake and explicit no-hammer),
par-3 greenies and deterministic queue. It also handles played holes absent from course
metadata conservatively: missing par asks instead of skipping the hole. Team questions
precede hole questions. Within a hole, selected-game order is retained deterministically.

Planning and recording now share complete-fact validation. Partial or malformed cached
facts remain pending. Recorders reject cross-game kinds and never overwrite a complete
existing answer; explicit corrections need a separate reviewed conflict-resolution flow.
They copy the affected map and leave unrelated data intact. A rejected answer returns no
replacement data. Unsupported Nassau-with-presses history remains a round-level pending
question; this slice has no declaration representation or answer for it.

Boundary: this is a question model for the existing five scan auxiliary-game kinds and
team assignment, not a general game-settings or historical-variation eligibility engine.
Plain Nassau/manual presses and other variations still require a separate authoritative
settings/history adapter before a mounted settlement flow can use the model's readiness.
No mounted caller may treat this helper as full settlement authorization. Team pairing
validity and player/account identity remain existing engine/round-authority responsibilities.
The question recorder cannot answer round-level facts. It does not save any score.

Regression evidence: five new RED failures demonstrated incomplete cache acceptance,
existing-answer replacement, wrong-game answers, incomplete payloads and missing press
history gating. After fixes: six focused partial-import suites / 65 tests PASS; tsc
--noEmit PASS. The queue test now declares its Jest globals consistently with sibling tests.
No new dependency, screen mount, customer copy, backend or native changes.

Parent acceptance remains open: photo intake/review, required settings, canonical auth
wiring, persistent account-linked multi-group continuation and next-hole scorecard mount.
