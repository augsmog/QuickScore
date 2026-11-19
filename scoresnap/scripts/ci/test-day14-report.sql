-- Disposable local Supabase stack only. Fixture writes roll back.
BEGIN;
INSERT INTO auth.users(id,created_at,is_anonymous) VALUES
 ('00000000-0000-0000-0000-000000005801', now() - interval '10 days', false),
 ('00000000-0000-0000-0000-000000005802', now() - interval '1 day', false);
INSERT INTO public.contests(id,owner_id,name,course,status,invite_code,created_at) VALUES
 ('00000000-0000-0000-0000-000000005811','00000000-0000-0000-0000-000000005801','Day 14 report fixture','{}','active','D14581',now() - interval '10 days');
INSERT INTO public.first_round_finishes(user_id,finished_at,source,contest_id) VALUES
 ('00000000-0000-0000-0000-000000005801', now() - interval '10 days', 'contest_completed','00000000-0000-0000-0000-000000005811');
INSERT INTO public.contest_players(id,contest_id,name) VALUES
 ('00000000-0000-0000-0000-000000005821','00000000-0000-0000-0000-000000005811','Host'),
 ('00000000-0000-0000-0000-000000005822','00000000-0000-0000-0000-000000005811','Guest 1'),
 ('00000000-0000-0000-0000-000000005823','00000000-0000-0000-0000-000000005811','Guest 2');
INSERT INTO public.contest_memberships(contest_id,user_id,role,status,player_id) VALUES
 ('00000000-0000-0000-0000-000000005811','00000000-0000-0000-0000-000000005801','host','approved',NULL),
 ('00000000-0000-0000-0000-000000005811','00000000-0000-0000-0000-000000005802','player','approved','00000000-0000-0000-0000-000000005822');
-- Use first eligible score event as the retention cohort anchor and include one D7 return.
INSERT INTO public.score_events(contest_id,player_id,hole,strokes,entered_by,created_at) VALUES
 ('00000000-0000-0000-0000-000000005811','00000000-0000-0000-0000-000000005821',1,4,'00000000-0000-0000-0000-000000005801',now() - interval '10 days'),
 ('00000000-0000-0000-0000-000000005811','00000000-0000-0000-0000-000000005821',2,4,'00000000-0000-0000-0000-000000005801',now() - interval '3 days'),
 ('00000000-0000-0000-0000-000000005811','00000000-0000-0000-0000-000000005822',1,4,'00000000-0000-0000-0000-000000005802',now());
INSERT INTO public.published_rounds(contest_id,owner_id,local_id,snapshot,ended_at) VALUES
 ('00000000-0000-0000-0000-000000005811','00000000-0000-0000-0000-000000005801','00000000-0000-0000-0000-000000005811','{}',now() - interval '10 days');

-- Execute the actual read-only worksheet in the same fixture transaction.
\i scripts/analytics/day14-report.sql

DO $$ DECLARE cohort_day date := ((now() - interval '10 days') AT TIME ZONE 'America/Los_Angeles')::date;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.activation_daily
      WHERE date=((now() - interval '10 days') AT TIME ZONE 'UTC')::date AND signups=1
        AND first_round_finished=1 AND activation_rate=1) THEN
    RAISE EXCEPTION 'Day 14 report activation fixture should be 1 finish / 1 signup';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.retention_cohorts
      WHERE cohort_date=cohort_day AND d7_mature=1 AND d7_retained=1
        AND d7_immature=0 AND d7_rate=1) THEN
    RAISE EXCEPTION 'Day 14 report D7 fixture should be 1/1 mature retained';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organizer_contest_players
      WHERE contest_id='00000000-0000-0000-0000-000000005811'
        AND players_added=3 AND members_joined=1) THEN
    RAISE EXCEPTION 'Day 14 report roster fixture should be 3 added / 1 joined';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.round_share_rate
      WHERE cohort_date=cohort_day AND confirmed_share_rounds=1
        AND confirmed_share_denominator=1 AND confirmed_share_rate=1) THEN
    RAISE EXCEPTION 'Day 14 report confirmed share fixture should be 1/1';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.retention_cohorts WHERE d7_mature=0 AND d7_immature=1 AND d7_rate IS NULL) THEN
    RAISE EXCEPTION 'immature cohorts should be reported with NULL D7 rate';
  END IF;
END $$;
ROLLBACK;
SELECT 'PASS: Day 14 worksheet activation, mature D7, NULL immature rate, roster, and confirmed share fixture values';
