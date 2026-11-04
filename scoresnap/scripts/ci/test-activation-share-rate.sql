-- Disposable local Supabase stack only. Fixture writes roll back.
BEGIN;
INSERT INTO auth.users(id, created_at, is_anonymous) VALUES
 ('00000000-0000-0000-0000-000000005601', now(), false),
 ('00000000-0000-0000-0000-000000005602', now(), false),
 ('00000000-0000-0000-0000-000000005603', now(), false),
 ('00000000-0000-0000-0000-000000005604', now(), false),
 ('00000000-0000-0000-0000-000000005612', now(), false),
 ('00000000-0000-0000-0000-000000005611', now(), false);

INSERT INTO public.contests(id, owner_id, name, course, status, invite_code) VALUES
 ('00000000-0000-0000-0000-000000005621','00000000-0000-0000-0000-000000005601','Share confirmed','{}','completed','SHR561'),
 ('00000000-0000-0000-0000-000000005622','00000000-0000-0000-0000-000000005602','Link only','{}','completed','SHR562'),
 ('00000000-0000-0000-0000-000000005623','00000000-0000-0000-0000-000000005603','Excluded','{}','completed','SHR563'),
 ('00000000-0000-0000-0000-000000005624','00000000-0000-0000-0000-000000005604','No share','{}','completed','SHR564'),
 ('00000000-0000-0000-0000-000000005612','00000000-0000-0000-0000-000000005612','Published-first local','{}','completed','SHR612'),
 ('00000000-0000-0000-0000-000000005641','00000000-0000-0000-0000-000000005601','Published share','{}','active','SHR641'),
 ('00000000-0000-0000-0000-000000005642','00000000-0000-0000-0000-000000005602','Published link','{}','active','SHR642'),
 ('00000000-0000-0000-0000-000000005643','00000000-0000-0000-0000-000000005612','Published-first','{}','active','SHR643');

INSERT INTO public.first_round_finishes(user_id, finished_at, source, contest_id) VALUES
 ('00000000-0000-0000-0000-000000005601', now() - interval '3 days', 'contest_completed','00000000-0000-0000-0000-000000005621'),
 ('00000000-0000-0000-0000-000000005602', now() - interval '3 days', 'contest_completed','00000000-0000-0000-0000-000000005622'),
 ('00000000-0000-0000-0000-000000005603', now() - interval '3 days', 'contest_completed','00000000-0000-0000-0000-000000005623'),
 ('00000000-0000-0000-0000-000000005604', now() - interval '3 days', 'contest_completed','00000000-0000-0000-0000-000000005624'),
 ('00000000-0000-0000-0000-000000005612', now() - interval '3 days', 'contest_completed','00000000-0000-0000-0000-000000005643');
INSERT INTO public.analytics_cohort_exclusions(profile_id, reason) VALUES
 ('00000000-0000-0000-0000-000000005603','automated_test');
-- Link RPCs target published_rounds rows, whose contest UUID can differ from the
-- local contest UUID in first_round_finishes. local_id carries that mapping.
INSERT INTO public.published_rounds(contest_id,owner_id,local_id,snapshot,ended_at) VALUES
 ('00000000-0000-0000-0000-000000005641','00000000-0000-0000-0000-000000005601','00000000-0000-0000-0000-000000005621','{}',now() - interval '3 days'),
 ('00000000-0000-0000-0000-000000005642','00000000-0000-0000-0000-000000005602','00000000-0000-0000-0000-000000005622','{}',now() - interval '3 days'),
 ('00000000-0000-0000-0000-000000005643','00000000-0000-0000-0000-000000005612','00000000-0000-0000-0000-000000005612','{}',now() - interval '3 days'),
 ('00000000-0000-0000-0000-000000005624','00000000-0000-0000-0000-000000005604','legacy-not-a-uuid','{}',now() - interval '3 days');
INSERT INTO public.contest_players(id,contest_id,name) VALUES
 ('00000000-0000-0000-0000-000000005631','00000000-0000-0000-0000-000000005621','Confirmed visitor'),
 ('00000000-0000-0000-0000-000000005632','00000000-0000-0000-0000-000000005612','Published-first visitor');
INSERT INTO public.contest_memberships(contest_id,user_id,role,status,player_id) VALUES
 ('00000000-0000-0000-0000-000000005621','00000000-0000-0000-0000-000000005611','player','approved','00000000-0000-0000-0000-000000005631'),
 ('00000000-0000-0000-0000-000000005612','00000000-0000-0000-0000-000000005611','player','approved','00000000-0000-0000-0000-000000005632'),
 ('00000000-0000-0000-0000-000000005643','00000000-0000-0000-0000-000000005611','viewer','approved',NULL);
INSERT INTO public.contest_join_requests(contest_id,requester,requested_name,status) VALUES
 ('00000000-0000-0000-0000-000000005624','00000000-0000-0000-0000-000000005611','Pending visitor','pending'),
 ('00000000-0000-0000-0000-000000005612','00000000-0000-0000-0000-000000005611','Published-first request','pending'),
 ('00000000-0000-0000-0000-000000005643','00000000-0000-0000-0000-000000005611','Published-first request','pending');
INSERT INTO public.share_links(token_hash,contest_id,expires_at) VALUES
 (repeat('a',64),'00000000-0000-0000-0000-000000005641',now()+interval '7 days'),
 (repeat('b',64),'00000000-0000-0000-0000-000000005642',now()+interval '7 days'),
 (repeat('c',64),'00000000-0000-0000-0000-000000005643',now()+interval '7 days');

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.round_share_rate
    WHERE confirmed_share_denominator=4
      AND confirmed_share_rounds=2
      AND confirmed_share_rate=2::numeric/4
      AND server_join_request_intent_rounds=2
      AND link_created_rounds=3
      AND client_share_intent_rounds IS NULL
      AND intent_and_link_created_denominator=4
  ) THEN RAISE EXCEPTION 'share rate must count one confirmed round, separate request/link signals, unknown client intent, and exclude test accounts'; END IF;
  IF has_table_privilege('anon','public.round_share_rate','SELECT')
     OR has_table_privilege('authenticated','public.round_share_rate','SELECT') THEN
    RAISE EXCEPTION 'client roles must not read share-rate analytics';
  END IF;
  IF NOT has_table_privilege('service_role','public.round_share_rate','SELECT') THEN
    RAISE EXCEPTION 'service_role must read share-rate analytics';
  END IF;
END $$;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.round_share_rate
      WHERE confirmed_share_rounds=2 AND server_join_request_intent_rounds=2) <> 1 THEN
    RAISE EXCEPTION 'published-first finish must count once despite matching signals on local and published UUIDs';
  END IF;
END $$;
ROLLBACK;
SELECT 'PASS: local-first and published-first joins resolve; duplicate local/published signals count once; exclusions and unknown client intent preserved';
