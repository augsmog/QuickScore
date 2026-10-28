-- Reverse rewritten 008. Refuses once a tournament has structure or versioned round scores.
-- Empty round-1 shells created for legacy contests may be removed. Accepted score_events stay.
-- Run after M2 is still installed and before rolling M2 back:
--   psql -v ON_ERROR_STOP=1 -f supabase/rollback/20261028100000_tournament_rounds_live.down.sql
BEGIN;
LOCK TABLE public.contests, public.contest_players, public.score_events, public.contest_rounds,
  public.contest_groups, public.round_player_assignments, public.round_scorer_scopes,
  public.group_submissions, public.sync_id_map IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF to_regprocedure('public.request_join(text,text)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='M3_DOWN_REQUIRES_FOUNDATION';
  END IF;
  IF EXISTS (SELECT 1 FROM public.contest_rounds WHERE round_number > 1)
     OR EXISTS (SELECT 1 FROM public.contest_groups)
     OR EXISTS (SELECT 1 FROM public.round_player_assignments)
     OR EXISTS (SELECT 1 FROM public.round_scorer_scopes)
     OR EXISTS (SELECT 1 FROM public.group_submissions)
     OR EXISTS (SELECT 1 FROM public.sync_id_map)
     OR EXISTS (SELECT 1 FROM public.score_events WHERE cell_version IS NOT NULL AND round_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.contests WHERE is_tournament) THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='M3_DOWN_UNSAFE';
  END IF;
END $$;
UPDATE public.score_events SET round_id = NULL WHERE round_id IS NOT NULL AND cell_version IS NULL;
ALTER TABLE public.score_events DROP CONSTRAINT IF EXISTS score_events_round_fk;
DROP TRIGGER IF EXISTS m3_default_round ON public.contests;
DROP POLICY IF EXISTS m3_score_player_scope ON public.score_events;
DROP FUNCTION IF EXISTS public.m3_score_insert_allowed(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.ensure_default_round();
DROP FUNCTION IF EXISTS public.sync_round_bundle(uuid, jsonb);
DROP FUNCTION IF EXISTS public.set_tournament_meta(uuid, boolean, integer);
DROP FUNCTION IF EXISTS public.tournament_snapshot(uuid);
DROP TABLE IF EXISTS public.group_submissions;
DROP TABLE IF EXISTS public.round_scorer_scopes;
DROP TABLE IF EXISTS public.round_player_assignments;
DROP TABLE IF EXISTS public.contest_groups;
DROP TABLE IF EXISTS public.sync_id_map;
DROP TABLE IF EXISTS public.contest_rounds;
DROP INDEX IF EXISTS public.contest_players_id_contest;
ALTER TABLE public.contest_players DROP CONSTRAINT IF EXISTS contest_players_status_check;
ALTER TABLE public.contest_players DROP CONSTRAINT IF EXISTS contest_players_sort_order_check;
ALTER TABLE public.contest_players DROP COLUMN IF EXISTS status, DROP COLUMN IF EXISTS course_handicaps, DROP COLUMN IF EXISTS sort_order;
ALTER TABLE public.contests DROP CONSTRAINT IF EXISTS contests_current_round_check;
ALTER TABLE public.contests DROP COLUMN IF EXISTS is_tournament, DROP COLUMN IF EXISTS current_round;
-- Restore the M2 write_score body. NULL rounds are rejected again; round tables are gone.
CREATE OR REPLACE FUNCTION public.write_score(contest_id uuid, round_id uuid, player_id uuid, hole integer, action text, strokes integer,
 expected_version bigint, op_id uuid, request_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c public.contests; uid uuid := auth.uid(); prior public.operation_receipts; cell public.score_events;
 version bigint; fingerprint text; answer jsonb;
BEGIN
 SELECT * INTO c FROM public.contests WHERE id=$1 FOR UPDATE;
 IF uid IS NULL OR c.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='FORBIDDEN'; END IF;
 -- Permission checks occur after contest lock and before receipt replay.
 IF NOT ((c.owner_id=uid AND NOT coalesce((auth.jwt()->>'is_anonymous')::boolean,false)) OR
 EXISTS(SELECT 1 FROM public.contest_memberships m WHERE m.contest_id=$1 AND m.user_id=uid AND m.status='approved'
 AND m.role='player' AND m.player_id=$3)) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='FORBIDDEN'; END IF;
 IF NOT c.sync_enabled OR c.protocol<>1 OR c.status<>'active' THEN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='SYNC_PAUSED'; END IF;
 IF $2 IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='ROUND_NOT_READY'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.contest_players p WHERE p.id=$3 AND p.contest_id=$1) OR $4 IS NULL OR $4 NOT BETWEEN 1 AND 18
 OR $5 IS NULL OR $5 NOT IN ('set','clear') OR ($5='set' AND ($6 IS NULL OR $6 NOT BETWEEN 1 AND 15)) OR ($5='clear' AND $6 IS NOT NULL)
 OR $7 IS NULL OR $7<0 OR $8 IS NULL OR $9 IS NULL OR length($9) NOT BETWEEN 1 AND 256 THEN
  RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_SCORE'; END IF;
 -- Bind all request fields server-side, including caller's immutable hash label.
 fingerprint := encode(extensions.digest(jsonb_build_array($1,$2,$3,$4,$5,$6,$7,$9)::text,'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text||':'||$8::text,0));
 SELECT * INTO prior FROM public.operation_receipts r WHERE r.actor=uid AND r.op_id=$8 FOR UPDATE;
 IF FOUND THEN
  IF prior.contest_id<>$1 OR prior.request_hash<>fingerprint THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='OP_REUSED'; END IF;
  RETURN prior.result;
 END IF;
 SELECT * INTO cell FROM public.score_events e WHERE e.contest_id=$1 AND e.round_id IS NOT DISTINCT FROM $2 AND e.player_id=$3 AND e.hole=$4
 AND e.cell_version IS NOT NULL ORDER BY e.cell_version DESC LIMIT 1 FOR UPDATE;
 version := coalesce(cell.cell_version,0);
 IF version<>$7 THEN answer := jsonb_build_object('status','conflict','version',version,'strokes',cell.strokes,'revision',c.sync_revision);
 ELSE
  UPDATE public.contests SET sync_revision=sync_revision+1 WHERE id=$1 RETURNING * INTO c;
  INSERT INTO public.score_events(contest_id,round_id,player_id,hole,action,strokes,entered_by,actor,cell_version,contest_revision,op_id,request_hash)
   VALUES($1,$2,$3,$4,$5,$6,uid,uid,version+1,c.sync_revision,$8,fingerprint);
  answer := jsonb_build_object('status','accepted','version',version+1,'strokes',$6,'revision',c.sync_revision);
 END IF;
 INSERT INTO public.operation_receipts(actor,op_id,request_hash,contest_id,result) VALUES(uid,$8,fingerprint,$1,answer);
 RETURN answer;
END $$;
COMMIT;
