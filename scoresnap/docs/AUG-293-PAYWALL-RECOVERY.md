# AUG-293: repeated paid-control taps and draft recovery

## Owner decision

Augie confirmed Tournament Director (TD) labeling on November 2 at 01:48 UTC,
then clarified at 03:28 UTC: “If the user keeps clicking on a paywall they should
keep seeing the paywall.” Linear comment 779acf43-74ab-4589-b17c-846c4277f91e
supersedes the old one-paywall-per-form proposal. Deliberate Multi-Day, Add group,
paid-game and Upgrade taps can reopen plans after returning from a prior paywall.
They are not automatic interruptions. Every real navigation remains counted.

## Interaction

- Existing TD badges identify locked hosting options before tap; game badges and
  pricing, trials, purchases and entitlement rules are unchanged.
- A synchronous navigation-in-flight guard prevents rapid taps from stacking
  paywalls. Returning focus releases that guard. Rerenders, step changes and
  entitlement refresh do not release it. There is no per-form prompt budget.
- Locked paid controls remain available to request plans after dismissal. Denied
  additions never change the draft. Existing paid selections remain removable.
- Upgrade targets the attempted plan, or TD for a Pro customer.
- Restored Pro enables paid games, not TD hosting; restored TD enables hosting.
  No rejected choice is automatically applied.
- Ineligible submission stays fail-closed and returns to the relevant form step,
  keeping names and choices available for correction.
- Explicit group removal preserves player fields and valid memberships, remapping
  removed or invalid indices only. Constructed groups are checked before save.

## Verification boundaries

Focused tests execute production handlers and actual entitlement/engine code
with modeled hooks/navigation. They cover repeat taps after dismissal in both
hosting-control orders, rapid mixed taps, paid games and Upgrade, eight-player
state retention, tier changes, downgrade rejection and group-removal safety.
These are not rendered browser/native evidence or real purchase/restore tests.

Mounted component state survives a pushed paywall and return. Full reload,
process death or route replacement that destroys the form is not covered by
this patch. The rendered journey adapter remains deferred; its historic timing
budget is unchanged and is not evidence of acceptance. Obsolete one-total-paywall
assertions must not be used for the owner-approved repeated-tap journey.

## Isolation

This is a current-main reconciliation of the reviewed repeated-tap correction.
Base remote main is c587143387a49e5356286c390b8089e27a51f953, exact tree
65a94c31a26adc23f617ccad358ec733c758fcca. Only the six AUG-293 files are
changed; unpublished AUG-289/AUG-306 code and PDF changes are not bundled.
Independent reconciliation review and rendered acceptance are still required.
No publication, billing, backend or credential changes.
Existing missing tournament-round save metadata is outside this patch.
