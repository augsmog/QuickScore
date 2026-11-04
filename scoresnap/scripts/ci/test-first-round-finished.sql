-- Disposable local Supabase stack only. All fixture writes roll back.
BEGIN;
INSERT INTO auth.users(id,created_at) VALUES
 ('00000000-0000-0000-0000-000000000a01','2020-01-01T12:00:00Z'),
 ('00000000-0000-0000-0000-000000000a02','2020-01-01T12:00:00Z'),
 ('00000000-0000-0000-0000-000000000a03','2020-01-01T12:00:00Z');
UPDATE auth.users SET is_anonymous=true WHERE id='00000000-0000-0000-0000-000000000a03';

INSERT INTO public.contests(id,owner_id,name,course,status,invite_code,updated_at) VALUES
 ('00000000-0000-0000-0000-000000000a11','00000000-0000-0000-0000-000000000a01','First completed','{}','active','ACT001','2020-01-02T12:00:00Z'),
 ('00000000-0000-0000-0000-000000000a12','00000000-0000-0000-0000-000000000a01','Second completed','{}','active','ACT002','2020-01-03T12:00:00Z'),
 ('00000000-0000-0000-0000-000000000a13','00000000-0000-0000-0000-000000000a03','Anonymous completed','{}','active','ACT003','2020-01-02T12:00:00Z'),
 ('00000000-0000-0000-0000-000000000a14','00000000-0000-0000-0000-000000000a02','Shared round','{}','active','ACT004','2020-01-02T12:00:00Z');

UPDATE public.contests SET status='completed',updated_at='2020-01-02T12:00:00Z' WHERE id='00000000-0000-0000-0000-000000000a11';
DO $$ DECLARE first_time timestamptz; BEGIN
  SELECT finished_at INTO first_time FROM public.first_round_finishes WHERE user_id='00000000-0000-0000-0000-000000000a01';
  IF first_time IS DISTINCT FROM '2020-01-02T12:00:00Z'::timestamptz THEN RAISE EXCEPTION 'first contest completion not recorded'; END IF;
  UPDATE public.contests SET status='completed',updated_at='2020-01-03T12:00:00Z' WHERE id='00000000-0000-0000-0000-000000000a12';
  IF (SELECT finished_at FROM public.first_round_finishes WHERE user_id='00000000-0000-0000-0000-000000000a01') IS DISTINCT FROM first_time THEN RAISE EXCEPTION 'second completion moved the first-finish timestamp'; END IF;
  IF (SELECT contest_id FROM public.first_round_finishes WHERE user_id='00000000-0000-0000-0000-000000000a01') IS DISTINCT FROM '00000000-0000-0000-0000-000000000a11'::uuid THEN RAISE EXCEPTION 'first completion contest was not retained'; END IF;
END $$;

UPDATE public.contests SET status='completed',updated_at='2020-01-02T12:00:00Z' WHERE id='00000000-0000-0000-0000-000000000a13';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.first_round_finishes WHERE user_id='00000000-0000-0000-0000-000000000a03') THEN
    RAISE EXCEPTION 'anonymous owner was recorded';
  END IF;
END $$;

INSERT INTO public.published_rounds(contest_id,owner_id,local_id,snapshot,ended_at)
VALUES ('00000000-0000-0000-0000-000000000a14','00000000-0000-0000-0000-000000000a02','activation-fixture','{}',NULL);
UPDATE public.published_rounds SET ended_at='2020-01-02T14:00:00Z' WHERE contest_id='00000000-0000-0000-0000-000000000a14';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.first_round_finishes WHERE user_id='00000000-0000-0000-0000-000000000a02'
      AND source='published_round_ended' AND contest_id='00000000-0000-0000-0000-000000000a14') THEN
    RAISE EXCEPTION 'shared-round end not recorded';
  END IF;
  UPDATE public.published_rounds SET ended_at='2020-01-03T14:00:00Z' WHERE contest_id='00000000-0000-0000-0000-000000000a14';
  IF (SELECT count(*) FROM public.first_round_finishes WHERE user_id='00000000-0000-0000-0000-000000000a02') <> 1 THEN
    RAISE EXCEPTION 're-finishing was not a no-op';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.activation_daily WHERE date='2020-01-02' AND signups=0
      AND first_round_finished=2 AND activation_rate IS NULL) THEN
    RAISE EXCEPTION 'zero-signup activation day should be present with NULL rate';
  END IF;
  IF has_table_privilege('anon','public.first_round_finishes','SELECT') OR has_table_privilege('authenticated','public.first_round_finishes','SELECT') THEN
    RAISE EXCEPTION 'client roles can read first-round records';
  END IF;
  IF NOT has_table_privilege('service_role','public.first_round_finishes','SELECT') OR has_table_privilege('service_role','public.first_round_finishes','INSERT') THEN
    RAISE EXCEPTION 'service_role must have read-only access';
  END IF;
END $$;
ROLLBACK;
SELECT 'PASS: first finish idempotence, both completion signals, anonymous exclusion, NULL zero-signup rate, and read-only service access';
