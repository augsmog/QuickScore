-- Disposable local Supabase stack only. All fixture writes roll back.
BEGIN;
INSERT INTO auth.users(id, created_at, is_anonymous) VALUES
 ('00000000-0000-0000-0000-000000005201', now() - interval '40 days', false),
 ('00000000-0000-0000-0000-000000005202', now() - interval '10 days', false),
 ('00000000-0000-0000-0000-000000005203', now() - interval '2 days', false);
INSERT INTO public.profiles(id, created_at) VALUES
 ('00000000-0000-0000-0000-000000005201', now() - interval '40 days'),
 ('00000000-0000-0000-0000-000000005202', now() - interval '10 days'),
 ('00000000-0000-0000-0000-000000005203', now() - interval '2 days');

INSERT INTO public.contests(id,owner_id,name,course,status,invite_code,created_at) VALUES
 ('00000000-0000-0000-0000-000000005211','00000000-0000-0000-0000-000000005201','Roster fixture','{}','active','RET521','2020-01-01T00:00:00Z');
INSERT INTO public.contest_players(id,contest_id,name) VALUES
 ('00000000-0000-0000-0000-000000005221','00000000-0000-0000-0000-000000005211','Host'),
 ('00000000-0000-0000-0000-000000005222','00000000-0000-0000-0000-000000005211','Guest 1'),
 ('00000000-0000-0000-0000-000000005223','00000000-0000-0000-0000-000000005211','Guest 2'),
 ('00000000-0000-0000-0000-000000005224','00000000-0000-0000-0000-000000005211','Guest 3');
INSERT INTO public.contest_memberships(contest_id,user_id,role,status) VALUES
 ('00000000-0000-0000-0000-000000005211','00000000-0000-0000-0000-000000005201','host','approved'),
 ('00000000-0000-0000-0000-000000005211','00000000-0000-0000-0000-000000005202','player','approved');

-- User 1 has day-7 activity. User 2's event is outside their [day 7, day 8) interval.
INSERT INTO public.score_events(contest_id,player_id,hole,strokes,entered_by,created_at) VALUES
 ('00000000-0000-0000-0000-000000005211','00000000-0000-0000-0000-000000005221',1,4,'00000000-0000-0000-0000-000000005201',now() - interval '33 days'),
 ('00000000-0000-0000-0000-000000005211','00000000-0000-0000-0000-000000005221',3,4,'00000000-0000-0000-0000-000000005201',now() - interval '10 days'),
 ('00000000-0000-0000-0000-000000005211','00000000-0000-0000-0000-000000005221',2,4,'00000000-0000-0000-0000-000000005202',now() - interval '2 days');

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.retention_cohorts
       WHERE signup_date=((now() - interval '40 days') AT TIME ZONE 'America/Los_Angeles')::date
         AND signups=1 AND d7_retained=1 AND d7_rate=1 AND d30_rate=1) THEN
    RAISE EXCEPTION 'mature D7/D30 retained user should count once';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.retention_cohorts
       WHERE signup_date=((now() - interval '2 days') AT TIME ZONE 'America/Los_Angeles')::date
         AND signups=1 AND d7_rate IS NULL AND d30_rate IS NULL) THEN
    RAISE EXCEPTION 'immature cohort rates must be NULL';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.retention_cohorts
       WHERE signup_date=(now() AT TIME ZONE 'America/Los_Angeles')::date
         AND signups=0 AND d7_rate IS NULL AND d30_rate IS NULL) THEN
    RAISE EXCEPTION 'zero-signup day must be present with NULL rates';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organizer_contest_players
       WHERE contest_id='00000000-0000-0000-0000-000000005211'
         AND players_added=4 AND members_joined=1) THEN
    RAISE EXCEPTION 'roster additions must remain distinct from approved joins';
  END IF;
  IF has_table_privilege('anon','public.retention_cohorts','SELECT')
     OR has_table_privilege('authenticated','public.retention_cohorts','SELECT')
     OR has_table_privilege('anon','public.organizer_contest_players','SELECT')
     OR has_table_privilege('authenticated','public.organizer_contest_players','SELECT') THEN
    RAISE EXCEPTION 'client roles must not read activation views';
  END IF;
  IF NOT has_table_privilege('service_role','public.retention_cohorts','SELECT')
     OR NOT has_table_privilege('service_role','public.organizer_contest_players','SELECT') THEN
    RAISE EXCEPTION 'service_role must read the views';
  END IF;
END $$;
ROLLBACK;
SELECT 'PASS: PT cohorts, elapsed D7/D30 retention, immature/zero-signup NULL rates, roster-vs-joins, and service-only read access';
