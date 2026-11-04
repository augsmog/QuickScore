-- Proposed only. Apply on a disposable stack until separately approved for live use.
CREATE TABLE public.analytics_cohort_exclusions (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('staff', 'automated_test', 'rehearsal')),
  added_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE public.analytics_cohort_exclusions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.analytics_cohort_exclusions TO service_role;

CREATE VIEW public.retention_cohorts AS
WITH first_eligible_use AS (
  SELECT e.entered_by AS profile_id, min(e.created_at) AS first_use_at
  FROM public.score_events e
  GROUP BY e.entered_by
), cohort_members AS (
  SELECT p.id AS profile_id,
         f.first_use_at,
         (f.first_use_at AT TIME ZONE 'America/Los_Angeles')::date AS cohort_date
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  JOIN first_eligible_use f ON f.profile_id = p.id
  LEFT JOIN public.analytics_cohort_exclusions x ON x.profile_id = p.id
  WHERE NOT coalesce(u.is_anonymous, false)
    AND x.profile_id IS NULL
), cohort_days AS (
  SELECT generate_series(min(cohort_date)::timestamp,
    ((now() AT TIME ZONE 'America/Los_Angeles')::date)::timestamp,
    interval '1 day')::date AS cohort_date
  FROM cohort_members
), daily AS (
  SELECT d.cohort_date,
         count(c.profile_id)::integer AS cohort_size,
         count(c.profile_id) FILTER (
           WHERE c.first_use_at + interval '192 hours' <= now()
         )::integer AS d7_mature,
         count(c.profile_id) FILTER (
           WHERE c.first_use_at + interval '192 hours' <= now()
             AND EXISTS (
               SELECT 1 FROM public.score_events e
               WHERE e.entered_by = c.profile_id
                 AND e.created_at >= c.first_use_at + interval '168 hours'
                 AND e.created_at < c.first_use_at + interval '192 hours'
             )
         )::integer AS d7_retained,
         count(c.profile_id) FILTER (
           WHERE c.first_use_at + interval '744 hours' <= now()
         )::integer AS d30_mature,
         count(c.profile_id) FILTER (
           WHERE c.first_use_at + interval '744 hours' <= now()
             AND EXISTS (
               SELECT 1 FROM public.score_events e
               WHERE e.entered_by = c.profile_id
                 AND e.created_at >= c.first_use_at + interval '720 hours'
                 AND e.created_at < c.first_use_at + interval '744 hours'
             )
         )::integer AS d30_retained
  FROM cohort_days d LEFT JOIN cohort_members c USING (cohort_date)
  GROUP BY d.cohort_date
)
SELECT cohort_date, cohort_size,
       d7_mature, d7_retained,
       CASE WHEN d7_mature = 0 THEN NULL
            ELSE d7_retained::numeric / d7_mature END AS d7_rate,
       cohort_size - d7_mature AS d7_immature,
       d30_mature, d30_retained,
       CASE WHEN d30_mature = 0 THEN NULL
            ELSE d30_retained::numeric / d30_mature END AS d30_rate,
       cohort_size - d30_mature AS d30_immature
FROM daily;

CREATE VIEW public.organizer_contest_players AS
SELECT c.id AS contest_id, c.owner_id, c.created_at,
       count(DISTINCT cp.id)::integer AS players_added,
       count(DISTINCT m.user_id) FILTER (
         WHERE m.status = 'approved' AND m.role <> 'host'
       )::integer AS members_joined
FROM public.contests c
LEFT JOIN public.contest_players cp ON cp.contest_id = c.id
LEFT JOIN public.contest_memberships m ON m.contest_id = c.id
GROUP BY c.id, c.owner_id, c.created_at;

REVOKE ALL ON TABLE public.retention_cohorts, public.organizer_contest_players
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.retention_cohorts, public.organizer_contest_players
  TO service_role;
