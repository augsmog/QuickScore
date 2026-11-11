# Day-14/30 metric map for the Pro-free launch

This is a source map, not a report of measured outcomes. Any targets used in a
Day-14/30 review remain planning assumptions until real cohorts are measured.
Pro is disabled behind `pro_enabled`; Tournament Director is the only paid IAP.
There is no Pro entitlement or Pro trial metric in this map.

| Metric | Source and interpretation |
| --- | --- |
| Activation: first round finished | table `public.first_round_finishes` in `supabase/proposed/20261103170000_first_round_finished.sql`; `public.activation_daily.first_round_finished` in the same migration counts eligible first finishes. Proposed only; not applied to production. |
| First scan | event `scorecard scan completed` in `src/services/posthog-log.ts`. This records completed scans, not necessarily a committed scorecard. |
| Players added per organizer contest | table `public.organizer_contest_players` in `supabase/proposed/20261104090000_activation_retention.sql`; `players_added` counts contest player rows and `members_joined` counts approved non-host memberships. Proposed only. |
| Share rate | table `public.round_share_rate` in `supabase/proposed/20261104110000_activation_share_rate.sql`; `confirmed_share_rate` is confirmed non-organizer members divided by eligible completed rounds. Link creation and join-request intent are separate signals, not confirmed shares. Proposed only. |
| D7 retention | table `public.retention_cohorts` in `supabase/proposed/20261104090000_activation_retention.sql`; `d7_rate` counts eligible accounts with a score event in the 168–192 hour window after first eligible use, over mature accounts. Proposed only. |
| D30 retention | table `public.retention_cohorts` in `supabase/proposed/20261104090000_activation_retention.sql`; `d30_rate` counts eligible accounts with a score event in the 720–744 hour window after first eligible use, over mature accounts. Proposed only. |
| Tournament Director paid conversion | event `tournament director entitlement started` in `src/services/posthog-log.ts`; count only `period_type = normal` for organizer accounts with at least one `contest setup saved`; report `trial` and `intro` starts separately. The active `SnapScore TD` entitlement is read directly from RevenueCat; the Pro feature flag does not affect this event. |

Supporting events currently present in code are `contest setup saved` and
`scorecard scores committed`, both in `src/services/posthog-log.ts`. They are
useful funnel context, but are not substitutes for the metrics above.
