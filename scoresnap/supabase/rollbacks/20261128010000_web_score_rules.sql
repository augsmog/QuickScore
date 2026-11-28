-- Rollback for proposed/20261128010000_web_score_rules.sql.
-- Restores public.submit_score byte for byte as in 20261029180000_sync_api.sql.
-- Pending flags stay in public.score_flags (the entered scores were never changed);
-- group hosts and reopen records stay too. They are removed by rolling back
-- 20261128000000_web_player_links.sql.
BEGIN;
LOCK TABLE public.contests,public.contest_players,public.score_events IN ACCESS EXCLUSIVE MODE;
CREATE OR REPLACE FUNCTION public.submit_score(contest_id uuid, round_id uuid, player_id uuid, hole integer, action text, strokes integer,
 expected_version bigint, op_id uuid, request_hash text, expected_revision bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c public.contests; uid uuid := auth.uid(); prior public.operation_receipts; cell public.score_events;
 version bigint; fingerprint text; answer jsonb; resolved uuid; allowed boolean;
BEGIN
 SELECT * INTO c FROM public.contests WHERE id=$1 FOR UPDATE;
 IF uid IS NULL OR c.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='FORBIDDEN'; END IF;
 IF NOT c.sync_enabled OR c.protocol<>1 OR c.status<>'active' THEN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='SYNC_PAUSED'; END IF;
 IF $2 IS NULL THEN SELECT r.id INTO resolved FROM public.contest_rounds r WHERE r.contest_id=$1 AND r.round_number=1;
 ELSE SELECT r.id INTO resolved FROM public.contest_rounds r WHERE r.id=$2 AND r.contest_id=$1; END IF;
 IF resolved IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='ROUND_NOT_READY'; END IF;
 allowed := (c.owner_id=uid AND NOT coalesce((auth.jwt()->>'is_anonymous')::boolean,false))
  OR EXISTS(SELECT 1 FROM public.contest_memberships m WHERE m.contest_id=$1 AND m.user_id=uid AND m.status='approved' AND m.role='player' AND m.player_id=$3
    AND (NOT EXISTS(SELECT 1 FROM public.round_player_assignments a WHERE a.contest_id=$1 AND a.round_id=resolved)
      OR EXISTS(SELECT 1 FROM public.round_player_assignments a WHERE a.contest_id=$1 AND a.round_id=resolved AND a.player_id=$3)))
  OR EXISTS(SELECT 1 FROM public.contest_memberships m
    JOIN public.round_scorer_scopes s ON s.contest_id=m.contest_id AND s.user_id=m.user_id AND s.status='approved' AND s.round_id=resolved
    JOIN public.round_player_assignments a ON a.contest_id=s.contest_id AND a.round_id=s.round_id AND a.group_id=s.group_id AND a.player_id=$3
    WHERE m.contest_id=$1 AND m.user_id=uid AND m.status='approved' AND m.role='scorer');
 IF NOT allowed THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='FORBIDDEN'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.contest_players p WHERE p.id=$3 AND p.contest_id=$1) OR $4 IS NULL OR $4 NOT BETWEEN 1 AND 18
 OR $5 IS NULL OR $5 NOT IN ('set','clear') OR ($5='set' AND ($6 IS NULL OR $6 NOT BETWEEN 1 AND 15)) OR ($5='clear' AND $6 IS NOT NULL)
 OR $10 IS NOT NULL AND $10<0 OR $7 IS NULL OR $7<0 OR $8 IS NULL OR $9 IS NULL OR length($9) NOT BETWEEN 1 AND 256 THEN
  RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_SCORE'; END IF;
 -- Preserve pre-M4b frozen-interface fingerprints for lost-response retries.
 fingerprint := encode(extensions.digest((CASE WHEN $10 IS NULL THEN jsonb_build_array($1,$2,$3,$4,$5,$6,$7,$9) ELSE jsonb_build_array($1,$2,$3,$4,$5,$6,$7,$9,$10) END)::text,'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('score-budget:'||uid::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text||':'||$8::text,0));
 SELECT * INTO prior FROM public.operation_receipts r WHERE r.actor=uid AND r.op_id=$8 FOR UPDATE;
 IF FOUND THEN
  IF prior.contest_id<>$1 OR prior.request_hash<>fingerprint THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='OP_REUSED'; END IF;
  RETURN prior.result;
 END IF;
 IF (SELECT count(*) FROM public.operation_receipts r WHERE r.actor=uid AND r.created_at>clock_timestamp()-interval '1 minute')>=120 THEN RAISE EXCEPTION USING ERRCODE='54000', MESSAGE='WRITE_RATE_LIMIT'; END IF;
 SELECT * INTO cell FROM public.score_events e WHERE e.contest_id=$1 AND e.round_id = resolved AND e.player_id=$3 AND e.hole=$4
 AND e.cell_version IS NOT NULL ORDER BY e.cell_version DESC LIMIT 1 FOR UPDATE;
 version := coalesce(cell.cell_version,0);
 IF version<>$7 OR ($10 IS NOT NULL AND c.sync_revision<>$10) THEN answer := jsonb_build_object('status','conflict','version',version,'strokes',cell.strokes,'revision',c.sync_revision);
 ELSE
  UPDATE public.contests SET sync_revision=sync_revision+1 WHERE id=$1 RETURNING * INTO c;
  INSERT INTO public.score_events(contest_id,round_id,player_id,hole,action,strokes,entered_by,actor,cell_version,contest_revision,op_id,request_hash)
   VALUES($1,resolved,$3,$4,$5,$6,uid,uid,version+1,c.sync_revision,$8,fingerprint);
  DELETE FROM public.group_submissions s USING public.round_player_assignments a
   WHERE a.contest_id=$1 AND a.round_id=resolved AND a.player_id=$3 AND s.contest_id=a.contest_id AND s.round_id=a.round_id AND s.group_id=a.group_id;
  answer := jsonb_build_object('status','accepted','version',version+1,'strokes',$6,'revision',c.sync_revision);
 END IF;
 INSERT INTO public.operation_receipts(actor,op_id,request_hash,contest_id,result) VALUES(uid,$8,fingerprint,$1,answer);
 RETURN answer;
END $$;
DO $guard$ BEGIN
 IF (SELECT md5(p.prosrc) FROM pg_proc p WHERE p.oid='public.submit_score(uuid,uuid,uuid,integer,text,integer,bigint,uuid,text,bigint)'::regprocedure) IS DISTINCT FROM 'b772aa7aaa048cecda62bbc6ba23bf95' THEN
  RAISE EXCEPTION 'submit_score did not return to the original body';
 END IF;
END $guard$;
DROP FUNCTION IF EXISTS public.finalize_window(uuid);
DROP FUNCTION IF EXISTS public.client_shows_held_changes();
NOTIFY pgrst, 'reload schema';
COMMIT;
