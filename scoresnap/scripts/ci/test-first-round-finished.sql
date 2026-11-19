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

-- Gap 2 (AUG-744): an owner who never toggled Live Share finishes a round. The client publishes a
-- single completed snapshot through publish_shared_round (no prior live-share publish exists), which
-- sets ended_at from the completed flag; the published_round INSERT trigger must record the finish
-- exactly once for the non-anonymous owner. Re-publishing the already-completed round adds nothing.
INSERT INTO auth.users(id,created_at) VALUES ('00000000-0000-0000-0000-000000000a05','2020-01-02T12:00:00Z');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000a05","role":"authenticated","is_anonymous":false}';
SELECT public.publish_shared_round('gap2-complete-no-share', '{"completed":true,"players":[{"displayName":"Pat","scores":[4],"total":4,"toPar":0}],"games":[]}');
SELECT public.publish_shared_round('gap2-complete-no-share', '{"completed":true,"players":[{"displayName":"Pat","scores":[4],"total":4,"toPar":0}],"games":[]}');
RESET ROLE;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.first_round_finishes WHERE user_id='00000000-0000-0000-0000-000000000a05') <> 1 THEN
    RAISE EXCEPTION 'Gap 2: completed snapshot published without a prior Live Share toggle did not record exactly one finish';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.first_round_finishes WHERE user_id='00000000-0000-0000-0000-000000000a05'
      AND source='published_round_ended') THEN
    RAISE EXCEPTION 'Gap 2: finish recorded under the wrong source';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.activation_daily WHERE date=(transaction_timestamp() AT TIME ZONE 'UTC')::date AND signups=0
      AND first_round_finished=4 AND activation_rate IS NULL) THEN
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
SELECT 'PASS: first finish idempotence, both completion signals including already-ended shared-round INSERT and Gap-2 publish_shared_round completed snapshot without a prior Live Share toggle, anonymous exclusion, NULL zero-signup rate, and read-only service access';
