# First round finished activation candidate

This is a proposed migration only and has not been applied to the live project.

The metric is a server-observed lower bound: it records account owners when a synced contest becomes completed or a published shared round receives its first `ended_at`. Local-only rounds that are never shared or synced are not observable here.

There is no historical backfill. Applying this migration to the live project requires a separate owner yes.

## Proposed activation retention views

`20261104090000_activation_retention.sql` adds server-observed D7/D30 retention
cohorts and organizer contest roster/join counts. Cohorts include all
non-anonymous profiles and group by the profile's `created_at` date in
America/Los_Angeles. Dn retention means at least one `score_events` row whose
`entered_by` is the user in the elapsed interval `[signup + n*24h,
signup + (n+1)*24h)`. A rate is NULL until the whole interval is mature, and on
zero-signup dates. Local-only rounds never reach the server, so this is a
lower bound; there is no historical backfill. `share_links` has no created
timestamp, so share rate remains unknown and no column is added.

These views are proposed only and have not been applied. Applying either
proposed activation SQL file to a live database requires separate owner approval.
