# First round finished activation candidate

This is a proposed migration only and has not been applied to the live project.

The metric is a server-observed lower bound: it records account owners when a synced contest becomes completed or a published shared round receives its first `ended_at`. Local-only rounds that are never shared or synced are not observable here.

There is no historical backfill. Applying this migration to the live project requires a separate owner yes.

## Proposed activation retention views

`20261104090000_activation_retention.sql` adds server-observed D7/D30 retention
cohorts and organizer contest roster/join counts. The unit is a
**server-observed account cohort**: each profile enters on its first
server-observed eligible use, the earliest `score_events.created_at` where
`entered_by` is that profile. Profiles without such an event are absent.
`cohort_date` is the first-use instant's America/Los_Angeles calendar date.
This is a lower bound: local-only rounds and devices that never reach the
server are not observable, and reinstalls or identity merges are not resolved.

`analytics_cohort_exclusions` supports `staff`, `automated_test`, and
`rehearsal` exclusions before outcomes are counted. It is empty by default and
must be populated by an operator before the first real calculation. D7
qualifying activity v1 is a `score_events` row entered by the profile in
`[first_use + 168h, first_use + 192h)`; D30 uses
`[first_use + 720h, first_use + 744h)`. Only mature members are in each rate's
denominator; immature members remain in the separate immature count, and a
rate is NULL when no members are mature. There is no historical backfill.

The organizer view reports roster `players_added` separately from approved,
non-host `members_joined`. Verified invitations sent are **not measured**
because there is no server-side invitation event, so the 3+ invitation
hypothesis cannot yet be compared. Share rate and trial-to-paid are not
measured here; no `profiles` columns are added.

These views are proposed only and have not been applied. Applying either
proposed activation SQL file to a live database requires a separate owner yes.
