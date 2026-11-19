-- Proposed only. Apply on a disposable stack until separately approved for live use.
-- This is a visibility signal only; activation_daily is intentionally unchanged.
CREATE OR REPLACE VIEW public.joined_round_finishes AS
WITH finish_events AS (
  SELECT c.id AS contest_id,
         c.id AS local_contest_id,
         p.contest_id AS published_contest_id,
         c.owner_id,
         coalesce(c.updated_at, now()) AS finished_at
  FROM public.contests c
  LEFT JOIN public.published_rounds p
    ON p.owner_id = c.owner_id
   AND (p.local_id = c.id::text OR p.contest_id = c.id)
  WHERE c.status = 'completed'

  UNION ALL

  SELECT CASE WHEN p.local_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              THEN p.local_id::uuid ELSE p.contest_id END AS contest_id,
         CASE WHEN p.local_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              THEN p.local_id::uuid ELSE p.contest_id END AS local_contest_id,
         p.contest_id AS published_contest_id,
         p.owner_id,
         p.ended_at AS finished_at
  FROM public.published_rounds p
  WHERE p.ended_at IS NOT NULL
), eligible_member_finishes AS (
  SELECT m.user_id, e.finished_at, e.contest_id, coalesce(u.is_anonymous, false) AS is_anonymous,
         row_number() OVER (PARTITION BY m.user_id ORDER BY e.finished_at, e.contest_id) AS finish_rank
  FROM finish_events e
  JOIN public.contest_memberships m
    ON m.contest_id = e.local_contest_id
    OR (e.published_contest_id IS NOT NULL AND m.contest_id = e.published_contest_id)
  JOIN auth.users u ON u.id = m.user_id
  WHERE m.status = 'approved'
    AND m.role IN ('player', 'scorer')
    AND m.user_id <> e.owner_id
)
SELECT user_id, finished_at AS first_joined_finish_at, contest_id, is_anonymous
FROM eligible_member_finishes
WHERE finish_rank = 1;

REVOKE ALL ON TABLE public.joined_round_finishes FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.joined_round_finishes TO service_role;
