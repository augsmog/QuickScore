-- Disposable local Supabase stack only. All fixture writes roll back.
BEGIN;
INSERT INTO auth.users(id, created_at, is_anonymous) VALUES
 ('00000000-0000-0000-0000-000000005201', now() - interval '40 days', false),
 ('00000000-0000-0000-0000-000000005202', now() - interval '9 days', false),
 ('00000000-0000-0000-0000-000000005203', now() - interval '11 days', false),
 ('00000000-0000-0000-0000-000000005204', now() - interval '13 days', false),
 ('00000000-0000-0000-0000-000000005205', now() - interval '2 days', false),
 ('00000000-0000-0000-0000-000000005206', now() - interval '40 days', false),
 ('00000000-0000-0000-0000-000000005207', now() - interval '35 days', false);
UPDATE public.profiles SET created_at = CASE id
  WHEN '00000000-0000-0000-0000-000000005201' THEN now() - interval '40 days'
  WHEN '00000000-0000-0000-0000-000000005202' THEN now() - interval '9 days'
  WHEN '00000000-0000-0000-0000-000000005203' THEN now() - interval '11 days'
  WHEN '00000000-0000-0000-0000-000000005204' THEN now() - interval '13 days'
  WHEN '00000000-0000-0000-0000-000000005205' THEN now() - interval '2 days'
  WHEN '00000000-0000-0000-0000-000000005206' THEN now() - interval '40 days'
  WHEN '00000000-0000-0000-0000-000000005207' THEN now() - interval '35 days'
END
WHERE id IN ('00000000-0000-0000-0000-000000005201',
             '00000000-0000-0000-0000-000000005202',
             '00000000-0000-0000-0000-000000005203',
             '00000000-0000-0000-0000-000000005204',
             '00000000-0000-0000-0000-000000005205',
             '00000000-0000-0000-0000-000000005206',
             '00000000-0000-0000-0000-000000005207');

INSERT INTO public.contests(id,owner_id,name,course,status,invite_code,created_at) VALUES
 ('00000000-0000-0000-0000-000000005211','00000000-0000-0000-0000-000000005201','Retention fixture','{}','active','RET521',now());
INSERT INTO public.contest_players(id,contest_id,name) VALUES
 ('00000000-0000-0000-0000-000000005221','00000000-0000-0000-0000-000000005211','Host'),
 ('00000000-0000-0000-0000-000000005222','00000000-0000-0000-0000-000000005211','Guest 1'),
 ('00000000-0000-0000-0000-000000005223','00000000-0000-0000-0000-000000005211','Guest 2'),
 ('00000000-0000-0000-0000-000000005224','00000000-0000-0000-0000-000000005211','Guest 3');
INSERT INTO public.contest_memberships(contest_id,user_id,role,status,player_id) VALUES
 ('00000000-0000-0000-0000-000000005211','00000000-0000-0000-0000-000000005201','host','approved',NULL),
 ('00000000-0000-0000-0000-000000005211','00000000-0000-0000-0000-000000005202','player','approved','00000000-0000-0000-0000-000000005222');

-- 5201's profile is 40 days old, but its first eligible use is 10 days old.
INSERT INTO public.score_events(contest_id,player_id,hole,strokes,entered_by,created_at) VALUES
 ('00000000-0000-0000-0000-000000005211','00000000-0000-0000-0000-000000005221',1,4,'00000000-0000-0000-0000-000000005201',now() - interval '10 days'),
 ('00000000-0000-0000-0000-000000005211','00000000-0000-0000-0000-000000005221',2,4,'00000000-0000-0000-0000-000000005201',now() - interval '2 days 12 hours'),
 -- Exact day-7 window boundaries: only hour 168 is retained.
 ('00000000-0000-0000-0000-000000005211','00000000-0000-0000-0000-000000005222',1,4,'00000000-0000-0000-0000-000000005202',now() - interval '9 days'),
 ('00000000-0000-0000-0000-000000005211','00000000-0000-0000-0000-000000005222',2,4,'00000000-0000-0000-0000-000000005202',now() - interval '9 days' + interval '167 hours'),
 ('00000000-0000-0000-0000-000000005211','00000000-0000-0000-0000-000000005223',1,4,'00000000-0000-0000-0000-000000005203',now() - interval '11 days'),
 ('00000000-0000-0000-0000-000000005211','00000000-0000-0000-0000-000000005223',2,4,'00000000-0000-0000-0000-000000005203',now() - interval '11 days' + interval '168 hours'),
 ('00000000-0000-0000-0000-000000005211','00000000-0000-0000-0000-000000005224',1,4,'00000000-0000-0000-0000-000000005204',now() - interval '13 days'),
 ('00000000-0000-0000-0000-000000005211','00000000-0000-0000-0000-000000005224',2,4,'00000000-0000-0000-0000-000000005204',now() - interval '13 days' + interval '192 hours'),
 ('00000000-0000-0000-0000-000000005211','00000000-0000-0000-0000-000000005221',3,4,'00000000-0000-0000-0000-000000005205',now() - interval '2 days'),
 ('00000000-0000-0000-0000-000000005211','00000000-0000-0000-0000-000000005222',3,4,'00000000-0000-0000-0000-000000005206',now() - interval '40 days');
INSERT INTO public.analytics_cohort_exclusions(profile_id,reason) VALUES
 ('00000000-0000-0000-0000-000000005206','staff');
-- 5207 has no score event and must not be included in any cohort.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.retention_cohorts
       WHERE cohort_date=((now() - interval '10 days') AT TIME ZONE 'America/Los_Angeles')::date
         AND cohort_size=1 AND d7_mature=1 AND d7_retained=1 AND d7_rate=1
         AND d7_immature=0 AND d30_mature=0 AND d30_immature=1 AND d30_rate IS NULL) THEN
    RAISE EXCEPTION 'first eligible use must anchor cohort despite older profile.created_at';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.retention_cohorts
       WHERE cohort_date=((now() - interval '9 days') AT TIME ZONE 'America/Los_Angeles')::date
         AND cohort_size=1 AND d7_mature=1 AND d7_retained=0 AND d7_rate=0) THEN
    RAISE EXCEPTION 'activity at hour 167 must not count for D7';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.retention_cohorts
       WHERE cohort_date=((now() - interval '11 days') AT TIME ZONE 'America/Los_Angeles')::date
         AND cohort_size=1 AND d7_mature=1 AND d7_retained=1 AND d7_rate=1) THEN
    RAISE EXCEPTION 'activity at hour 168 must count for D7';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.retention_cohorts
       WHERE cohort_date=((now() - interval '13 days') AT TIME ZONE 'America/Los_Angeles')::date
         AND cohort_size=1 AND d7_mature=1 AND d7_retained=0 AND d7_rate=0) THEN
    RAISE EXCEPTION 'activity at hour 192 must not count for D7';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.retention_cohorts
       WHERE cohort_date=((now() - interval '2 days') AT TIME ZONE 'America/Los_Angeles')::date
         AND cohort_size=1 AND d7_mature=0 AND d7_retained=0
         AND d7_immature=1 AND d7_rate IS NULL AND d30_mature=0 AND d30_immature=1 AND d30_rate IS NULL) THEN
    RAISE EXCEPTION 'immature members must remain visible with NULL rate at zero maturity';
  END IF;
  IF EXISTS (SELECT 1 FROM public.retention_cohorts
       WHERE cohort_date=((now() - interval '40 days') AT TIME ZONE 'America/Los_Angeles')::date) THEN
    RAISE EXCEPTION 'excluded staff profile must not form a cohort';
  END IF;
  IF EXISTS (SELECT 1 FROM public.retention_cohorts
       WHERE cohort_date=((now() - interval '35 days') AT TIME ZONE 'America/Los_Angeles')::date) THEN
    RAISE EXCEPTION 'profile with no eligible score event must not form a cohort';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.retention_cohorts
       WHERE cohort_date=(now() AT TIME ZONE 'America/Los_Angeles')::date
         AND cohort_size=0 AND d7_rate IS NULL AND d30_rate IS NULL) THEN
    RAISE EXCEPTION 'zero-use cohort date must remain present with NULL rates';
  END IF;
  IF EXISTS (SELECT 1 FROM public.retention_cohorts
       WHERE cohort_size < 0 OR d7_mature > cohort_size OR d30_mature > cohort_size) THEN
    RAISE EXCEPTION 'cohort and maturity counts are inconsistent';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organizer_contest_players
       WHERE contest_id='00000000-0000-0000-0000-000000005211'
         AND players_added=4 AND members_joined=1) THEN
    RAISE EXCEPTION 'roster additions must remain distinct from approved joins';
  END IF;
  IF has_table_privilege('anon','public.retention_cohorts','SELECT')
     OR has_table_privilege('authenticated','public.retention_cohorts','SELECT')
     OR has_table_privilege('anon','public.organizer_contest_players','SELECT')
     OR has_table_privilege('authenticated','public.organizer_contest_players','SELECT')
     OR has_table_privilege('anon','public.analytics_cohort_exclusions','SELECT')
     OR has_table_privilege('authenticated','public.analytics_cohort_exclusions','SELECT') THEN
    RAISE EXCEPTION 'client roles must not read activation views or exclusions';
  END IF;
  IF NOT has_table_privilege('service_role','public.retention_cohorts','SELECT')
     OR NOT has_table_privilege('service_role','public.organizer_contest_players','SELECT')
     OR NOT has_table_privilege('service_role','public.analytics_cohort_exclusions','SELECT')
     OR NOT has_table_privilege('service_role','public.analytics_cohort_exclusions','INSERT') THEN
    RAISE EXCEPTION 'service_role must read views and maintain exclusions';
  END IF;
END $$;
ROLLBACK;
SELECT 'PASS: first-use cohorts, staff/no-use exclusions, exact D7 boundaries, maturity counts, roster-vs-joins, service-only access';
