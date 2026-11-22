# Wizard name keyboard checkpoint

Exact parent: 51b41f44764a634636740603ef28bf03caca985f.
Private QA-only successor; no app, flags, workflow, settings or rules changed.

Ordinary Player 2 entry uses the existing synthetic QAGuest and interactable field.
The existing fill operation now has an explicit capture_keyboard option, selected
only for that wizard entry. After actual input text and before the existing Back
key, BoundDriver captures name-keyboard. It requires the actual setup/card/name
and HCP semantics, uniquely focused name input, the same native resource ID and
horizontal anchor proved before typing, exact synthetic value, and a measured
visible full-width bottom IME. The name field must be entirely above the IME.
The full normal capture boundary still verifies before/after hierarchy, foreground,
inset observation, OS scale, boot, installed APK, source, and PNG. No screenshot
following dismissal is reused as keyboard evidence.

Only role/count/geometry booleans and frames enter checkpointEvidence; no input
values, raw dumps, private labels or device IDs are emitted. Converter admission
requires that evidence, a matching uniquely focused normalized node, and the
same measured IME frame. It maps to new-contest/name entry (keyboard up).

Then the existing Back operation dismisses IME. A fresh app readback must show
IME not visible, the typed player pair still present, and the ordinary Continue
control. After the remaining usual player additions, setup Continue again requires
IME absent and invokes the original footer action + destination guard. Separate
receipts record capture, dismissal/control availability, and destination success.
Failures never count capture or cold/recovery navigation as a completed Continue.

No native execution was performed. API35 dumps/client state must satisfy the
existing strict inset parser. A resized/non-fullscreen app window, foreign IME
hierarchy nodes, ambiguous name/HCP/focus, missing inset evidence or field occlusion
stop explicitly. No new resize support, keyboard behavior, fallback or bypass.

Portable verification: 62 Python controls; 6 converter controls; 81 existing
deterministic tests. Keyboard controls cover actual sanitized hierarchy selectors,
visible/hidden/missing IME, wrong value, false/duplicate focus, field occlusion,
actual capture receipt creation, capture-before-dismiss call order, and the
required independent Continue guard. Source fixtures and subprocess fakes are
portable controls, not native evidence.

Remaining required checkpoints NOT wired to admitted device-layout/v1 output:
- new-contest: rounds 2/3/4 (scrolled); team off/on; player card A/B chips + HCP;
  combined stress (multi-day+teams+8 players); paywall routing; Start.
- join: Home/sign-in entry; invalid code; valid code + name (keyboard);
  pending approval.
- paywall: /paywall?tier=td; plan cards (CTA above fold on SE); cancel/restore.
Some related supplemental scenes already execute, notably rounds and fallback
pricing, but they do not establish the complete named checkpoint contract.
Initialized RN scale, text metrics, independent visual review and online native
Join remain open. Full required gate continues to reject incomplete evidence.
