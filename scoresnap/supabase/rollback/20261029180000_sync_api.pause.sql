-- Operational rollback AFTER enrollment: retain strict reads, all data and ACL guards.
-- This is NOT schema down; keep the migration ledger applied. Fix forward.
BEGIN;
LOCK TABLE public.contests IN SHARE ROW EXCLUSIVE MODE;
UPDATE public.contests SET sync_enabled=false WHERE protocol=1;
REVOKE EXECUTE ON FUNCTION public.submit_score(uuid,uuid,uuid,integer,text,integer,bigint,uuid,text,bigint),
 public.write_score(uuid,uuid,uuid,integer,text,integer,bigint,uuid,text),public.request_join(text,text),
 public.enroll_contest(uuid,bigint),public.decide_join_request(uuid,boolean,uuid),public.sync_round_bundle(uuid,jsonb),public.set_tournament_meta(uuid,boolean,integer)
 FROM authenticated;
ALTER TABLE public.contests DISABLE TRIGGER m4b_revision_hint;
COMMIT;
