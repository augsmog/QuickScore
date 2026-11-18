# AUG-278: Day-0 round and free Tournament Director preparation

Status: **builder prep only; real-event outcomes remain unfulfilled.** Source of truth: AUG-278's live Linear description and latest owner replies. All nine engineering children are Done/Duplicate; this document does not add an engineering launch gate or complete the parent.

## Automated product acceptance

Acceptance = automated proof only, at the exact tested build SHA, with CI and an independent checker. Owner use is feedback only; nobody must play, install, hold a phone, or visually approve a build for acceptance. New feedback becomes a regression ticket.

Existing repository evidence below covers bounded scenarios; it does not prove public availability, production sharing/auth configuration, a real round, or any approved offer. Reuse correctly bound evidence; rerun only missing acceptance checks.

| Gate | What it proves | Evidence source (from scoresnap/) |
|---|---|---|
| G2 | Scored 56-player, 14-group leaderboard: ranks, ties, totals, THRU | `src/engine/__tests__/td-readiness-56-player.test.ts` |
| G4 | Tournament-scale settlement gating | `src/engine/__tests__/contest-settlement-16p.test.ts` |
| E2E | 16-player tournament flow | `scoresnap/e2e/tournament-16-player.mjs` (repository-root path) |
| E2E | 56-player empty state only, no scored data | `scoresnap/e2e/hopwood-cup-56-player.mjs` (repository-root path) |

## Day-0 real-round outcome, post-launch

Wait for recorded live-release evidence and the approved named group/event. A real group completes a round in the live post-launch build; this is a GTM outcome, not a request for owner testing. Link the persisted round/event record, round ID, timestamps, build SHA, and automatically generated operator record using AUG-278's November 2 operator-record format. Unknown and partial outcomes remain explicit; a rehearsal never counts as a real round.

Use the existing reviewed packet at `/workspace/shared/snapscore-aug278/day0-and-event-drafts-reviewed.txt`; this internal runbook creates no invitation, recap, or offer copy. For every invitation or recap, the exact message, named recipient/group, and channel require Augie's recorded yes before sending. Record approval and send receipts separately. A private recap approval does not authorize public posting.

## Days 5-10 free TD offers

Track 3-5 distinct real-event offers sent to named trips/member-guests through Customer Desk after actual launch. For each event record an opaque candidate key, fit, dates, build evidence, exact message approval, send receipt, acceptance, authorized grant/expiry evidence, and actual outcome. Keep private roster/contact data out of public evidence.

Free-access grant terms and mechanism require separate explicit approval from Augie before any grant or commitment. Customer Desk verifies the authorized operator, scope, period, and expiry. Do not promise access while the mechanism is unknown. Do not infer approval from this runbook or a generic draft.

Count offers sent, accepted offers, verified grants, and completed events separately; pending approval is not sent. Three completed events are not an extra acceptance criterion: the ticket requests 3-5 real-event offers. Never fabricate names, approvals, rounds, receipts, or outcomes.

## Verification and current disposition

An independent read-only verifier checks recorded release timing, automated exact-build product evidence, the real round's persisted data/operator record, exact-message approvals matching recipients and send receipts, and separate grant approvals/evidence. This preparation PR cannot close AUG-278. Keep the parent Todo + blocked until launch and event/outreach/grant conditions clear; no outreach, grant, production mutation, deployment, or submission is authorized here.
