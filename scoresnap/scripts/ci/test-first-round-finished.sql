-- Disposable local Supabase stack only. All fixture writes roll back.
BEGIN;
INSERT INTO auth.users(id,created_at) VALUES
 ('00000000-0000-0000-0000-000000000a01','2020-01-01T12:00:00Z'),
 ('00000000-0000-0000-0000-000000000a02','2020-01-01T12:00:00Z'),
 ('00000000-0000-0000-0000-000000000a03','2020-01-01T12:00:00Z'),
 ('00000000-0000-0000-0000-000000000a04','2020-01-01T12:00:00Z');
UPDATE auth.users SET is_anonymous=true WHERE id='00000000-0000-0000-0000-000000000a03';

INSERT INTO public.contests(id,owner_id,name,course,status,invite_code,updated_at) VALUES
 ('00000000-0000-0000-0000-000000000a11','00000000-0000-0000-0000-000000000a01','First completed','{}','active','ACT001','2020-01-02T12:00:00Z'),
 ('00000000-0000-0000-0000-000000000a12','00000000-0000-0000-0000-000000000a01','Second completed','{}','active','ACT002','2020-01-03T12:00:00Z'),
 ('00000000-0000-0000-0000-000000000a13','00000000-0000-0000-0000-000000000a03','Anonymous completed','{}','active','ACT003','2020-01-02T12:00:00Z'),
 ('00000000-0000-0000-0000-000000000a14','00000000-0000-0000-0000-000000000a02','Shared round','{}','active','ACT004','2020-01-02T12:00:00Z'),
 ('00000000-0000-0000-0000-000000000a15','00000000-0000-0000-0000-000000000a04','Completed shared round','{}','active','ACT005','2020-01-02T12:00:00Z');

UPDATE public.contests SET status='completed',updated_at='2020-01-02T12:00:00Z' WHERE id='00000000-0000-0000-0000-000000000a11';
DO $$ DECLARE first_time timestamptz; BEGIN
  SELECT finished_at INTO first_time FROM public.first_round_finishes WHERE user_id='00000000-0000-0000-0000-000000000a01';
  IF first_time IS DISTINCT FROM transaction_timestamp() THEN RAISE EXCEPTION 'first contest completion not recorded from server timestamp'; END IF;
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

-- AUG-737 (AUG-277 Gap 1): a scan Quick Settle commits a contest for its owner and
-- flips it from 'active' to 'completed' (scoresnap/app/scan/review.tsx) — the same
-- contests active->completed write shape asserted above for a01 (non-anonymous) and
-- a03 (anonymous). Assert that shape records the activation signal exactly once for a
-- non-anonymous owner via the contest_completed source and never for an anonymous one.
-- Pure assertions over the rows already created above: no new finish, so the counts
-- and zero-signup activation_daily total below are unchanged.
DO $$ BEGIN
  IF (SELECT count(*) FROM public.first_round_finishes
      WHERE user_id='00000000-0000-0000-0000-000000000a01' AND source='contest_completed') <> 1 THEN
    RAISE EXCEPTION 'quick-settle-shaped contest completion not recorded exactly once for non-anonymous owner';
  END IF;
  IF EXISTS (SELECT 1 FROM public.first_round_finishes WHERE user_id='00000000-0000-0000-0000-000000000a03') THEN
    RAISE EXCEPTION 'quick-settle-shaped completion recorded for anonymous owner';
  END IF;
END $$;

INSERT INTO public.published_rounds(contest_id,owner_id,local_id,snapshot,ended_at)
VALUES ('00000000-0000-0000-0000-000000000a14','00000000-0000-0000-0000-000000000a02','activation-fixture','{}',NULL);
UPDATE public.published_rounds SET ended_at=transaction_timestamp() WHERE contest_id='00000000-0000-0000-0000-000000000a14';
DO $$ DECLARE first_time timestamptz; BEGIN
  SELECT finished_at INTO first_time FROM public.first_round_finishes WHERE user_id='00000000-0000-0000-0000-000000000a02';
  IF NOT EXISTS (SELECT 1 FROM public.first_round_finishes WHERE user_id='00000000-0000-0000-0000-000000000a02'
      AND source='published_round_ended' AND contest_id='00000000-0000-0000-0000-000000000a14') THEN
    RAISE EXCEPTION 'shared-round end not recorded';
  END IF;
  UPDATE public.published_rounds SET ended_at=transaction_timestamp()+interval '1 day' WHERE contest_id='00000000-0000-0000-0000-000000000a14';
  IF (SELECT count(*) FROM public.first_round_finishes WHERE user_id='00000000-0000-0000-0000-000000000a02') <> 1
      OR (SELECT finished_at FROM public.first_round_finishes WHERE user_id='00000000-0000-0000-0000-000000000a02') IS DISTINCT FROM first_time THEN
    RAISE EXCEPTION 're-finishing changed or duplicated the first record';
  END IF;
END $$;

-- A shared round may be published already ended; the INSERT trigger must record it.
INSERT INTO public.published_rounds(contest_id,owner_id,local_id,snapshot,ended_at)
VALUES ('00000000-0000-0000-0000-000000000a15','00000000-0000-0000-0000-000000000a04','activation-completed-fixture','{}',transaction_timestamp());
DO $$ DECLARE first_time timestamptz; BEGIN
  SELECT finished_at INTO first_time FROM public.first_round_finishes WHERE user_id='00000000-0000-0000-0000-000000000a04';
  IF first_time IS DISTINCT FROM transaction_timestamp()
      OR NOT EXISTS (SELECT 1 FROM public.first_round_finishes WHERE user_id='00000000-0000-0000-0000-000000000a04'
        AND source='published_round_ended' AND contest_id='00000000-0000-0000-0000-000000000a15') THEN
    RAISE EXCEPTION 'already-ended shared-round INSERT not recorded';
  END IF;
  UPDATE public.published_rounds SET ended_at=transaction_timestamp()+interval '1 day' WHERE contest_id='00000000-0000-0000-0000-000000000a15';
  IF (SELECT count(*) FROM public.first_round_finishes WHERE user_id='00000000-0000-0000-0000-000000000a04') <> 1
      OR (SELECT finished_at FROM public.first_round_finishes WHERE user_id='00000000-0000-0000-0000-000000000a04') IS DISTINCT FROM first_time THEN
    RAISE EXCEPTION 'later update duplicated or moved the INSERT finish';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.activation_daily WHERE date=(transaction_timestamp() AT TIME ZONE 'UTC')::date AND signups=0
      AND first_round_finished=3 AND activation_rate IS NULL) THEN
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
SELECT 'PASS: first finish idempotence, both completion signals including already-ended shared-round INSERT, anonymous exclusion, NULL zero-signup rate, and read-only service access';
