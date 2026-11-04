-- Proposed only. Apply on a disposable stack until separately approved for live use.
-- Cohorts include all non-anonymous profiles (not only first-round finishers).
-- Signup date is the America/Los_Angeles calendar date. Dn activity uses the
-- elapsed UTC interval [signup + n*24h, signup + (n+1)*24h).
CREATE VIEW public.retention_cohorts AS
WITH cohort_users AS (
  SELECT p.id AS user_id,
         (p.created_at AT TIME ZONE 'America/Los_Angeles')::date AS signup_date,
         p.created_at AS signed_up_at
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE NOT coalesce(u.is_anonymous, false)
), cohort_days AS (
  SELECT generate_series(min(signup_date)::timestamp,
    ((now() AT TIME ZONE 'America/Los_Angeles')::date)::timestamp,
    interval '1 day')::date AS signup_date
  FROM cohort_users
), daily AS (
  SELECT d.signup_date, count(c.user_id)::integer AS signups,
         count(c.user_id) FILTER (WHERE EXISTS (
           SELECT 1 FROM public.score_events e
           WHERE e.entered_by = c.user_id
             AND e.created_at >= c.signed_up_at + interval '168 hours'
             AND e.created_at < c.signed_up_at + interval '192 hours'
         ))::integer AS d7_retained,
         count(c.user_id) FILTER (WHERE EXISTS (
           SELECT 1 FROM public.score_events e
           WHERE e.entered_by = c.user_id
             AND e.created_at >= c.signed_up_at + interval '720 hours'
             AND e.created_at < c.signed_up_at + interval '744 hours'
         ))::integer AS d30_retained,
         bool_and(c.signed_up_at + interval '192 hours' <= now()) AS d7_mature,
         bool_and(c.signed_up_at + interval '744 hours' <= now()) AS d30_mature
  FROM cohort_days d LEFT JOIN cohort_users c USING (signup_date)
  GROUP BY d.signup_date
)
SELECT signup_date, signups, d7_retained,
       CASE WHEN signups = 0 OR NOT coalesce(d7_mature, false) THEN NULL
            ELSE d7_retained::numeric / signups END AS d7_rate,
       d30_retained,
       CASE WHEN signups = 0 OR NOT coalesce(d30_mature, false) THEN NULL
            ELSE d30_retained::numeric / signups END AS d30_rate
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
