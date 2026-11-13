-- Read-only Day 14 worksheet. Run as service_role against the approved reporting
-- database only after the owner separately approves the proposed migrations.
-- Rates are fractions (0-1); targets are planning assumptions, not commitments.
WITH worksheet AS (
  SELECT 'activation'::text AS section,
         d.date::text AS period,
         'first round finished'::text AS metric,
         d.first_round_finished::numeric AS numerator,
         d.signups::numeric AS denominator,
         d.activation_rate::numeric AS rate,
         NULL::numeric AS target_low,
         NULL::numeric AS target_high,
         'Daily first-round finishes / non-anonymous signups; target not set.'::text AS notes
  FROM public.activation_daily d

  UNION ALL

  SELECT 'retention', r.cohort_date::text, 'D7 retained / mature',
         r.d7_retained::numeric, r.d7_mature::numeric, r.d7_rate::numeric,
         0.30::numeric, 0.40::numeric,
         format('D7 mature=%s; immature=%s. 30-40%% is a planning assumption.',
                r.d7_mature, r.d7_immature)
  FROM public.retention_cohorts r

  UNION ALL

  SELECT 'organizer roster', o.contest_id::text, 'players added / approved members joined',
         o.players_added::numeric, o.members_joined::numeric, NULL::numeric,
         3::numeric, NULL::numeric,
         'Planning assumption: 3+ players added per contest; invitations: not measured.'
  FROM public.organizer_contest_players o

  UNION ALL

  SELECT 'sharing', s.cohort_date::text, 'confirmed share rate',
         s.confirmed_share_rounds::numeric, s.confirmed_share_denominator::numeric,
         s.confirmed_share_rate::numeric, 0.10::numeric, NULL::numeric,
         'Planning assumption: 10%; confirmed non-organizer member only. Link creation and server join requests are separate signals; invitations: not measured.'
  FROM public.round_share_rate s

  UNION ALL

  SELECT 'joined finish', (f.first_joined_finish_at AT TIME ZONE 'UTC')::date::text,
         'joined-round first finishes (registered / anonymous)',
         count(*) FILTER (WHERE NOT f.is_anonymous)::numeric,
         count(*) FILTER (WHERE f.is_anonymous)::numeric,
         NULL::numeric, NULL::numeric, NULL::numeric,
         'Not part of activation; activation definition unchanged.'::text
  FROM public.joined_round_finishes f
  GROUP BY (f.first_joined_finish_at AT TIME ZONE 'UTC')::date
)
SELECT section, period, metric, numerator, denominator, rate,
       target_low, target_high, notes
FROM worksheet
ORDER BY section, period, metric;
