-- Proposed only. Apply on a disposable stack until separately approved for live use.
-- first_round_finishes is one eligible first completed round per non-anonymous account.
CREATE VIEW public.round_share_rate AS
WITH eligible_rounds AS (
  SELECT f.user_id AS organizer_id,
         f.contest_id,
         f.finished_at,
         (f.finished_at AT TIME ZONE 'America/Los_Angeles')::date AS cohort_date,
         p.contest_id AS published_contest_id,
         CASE WHEN p.local_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              THEN p.local_id::uuid END AS mapped_local_contest_id
  FROM public.first_round_finishes f
  JOIN auth.users u ON u.id = f.user_id
  LEFT JOIN public.analytics_cohort_exclusions x ON x.profile_id = f.user_id
  -- publish_shared_round may allocate a separate server contest UUID while local_id
  -- retains the local contest UUID. Resolve either finish representation, and safely
  -- ignore malformed legacy local_id values rather than casting them as UUIDs.
  LEFT JOIN public.published_rounds p ON p.owner_id = f.user_id
    AND (p.contest_id = f.contest_id OR p.local_id = f.contest_id::text)
  WHERE NOT coalesce(u.is_anonymous, false)
    AND x.profile_id IS NULL
), round_signals AS (
  SELECT r.*,
         EXISTS (
           SELECT 1 FROM public.contest_memberships m
           WHERE m.contest_id IN (r.contest_id, r.published_contest_id, r.mapped_local_contest_id)
             AND m.user_id <> r.organizer_id
             AND m.status = 'approved'
             AND m.role <> 'host'
         ) AS has_confirmed_non_organizer_member,
         EXISTS (
           SELECT 1 FROM public.contest_join_requests q
           WHERE q.contest_id IN (r.contest_id, r.published_contest_id, r.mapped_local_contest_id)
             AND q.requester <> r.organizer_id
         ) AS has_server_observed_join_request,
         EXISTS (
           SELECT 1 FROM public.share_links l
           WHERE l.contest_id IN (r.contest_id, r.published_contest_id, r.mapped_local_contest_id)
         ) AS has_created_link
  FROM eligible_rounds r
)
SELECT cohort_date,
       count(*)::integer AS eligible_completed_rounds,
       count(*) FILTER (WHERE has_confirmed_non_organizer_member)::integer
         AS confirmed_share_rounds,
       count(*)::integer AS confirmed_share_denominator,
       count(*) FILTER (WHERE has_confirmed_non_organizer_member)::numeric
         / nullif(count(*), 0) AS confirmed_share_rate,
       count(*) FILTER (WHERE has_server_observed_join_request)::integer
         AS server_join_request_intent_rounds,
       count(*) FILTER (WHERE has_created_link)::integer AS link_created_rounds,
       NULL::integer AS client_share_intent_rounds,
       count(*)::integer AS intent_and_link_created_denominator
FROM round_signals
GROUP BY cohort_date;

REVOKE ALL ON TABLE public.round_share_rate FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.round_share_rate TO service_role;
