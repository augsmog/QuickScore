-- OFFLINE PROPOSAL ONLY. Requires Augie's explicit live migration approval.
-- Predecessor: 20261128000000_web_player_links.sql (must be applied first).
--
-- THIS FILE CHANGES AN EXISTING FUNCTION: public.submit_score, which every score write
-- from every app and web client goes through (public.write_score calls it). Nothing else
-- is touched: same signature, owner, grants, validation, rate limit and receipts.
-- Four marked additions ("WEB RULE 1" to "WEB RULE 4"); every other line is the body
-- from 20261029180000_sync_api.sql, which is what production runs today.
--
-- What changes for an existing app user:
--  1. The first person to enter a score for a group becomes that group's host.
--  2. Someone who is not the group host or the organizer, changing a score that another
--     person entered, no longer overwrites it. The write answers "conflict" with
--     "flagged": true, the entered score stays, and a row waits in public.score_flags.
--  3. For one hour after finalizing, a scorer who called public.reopen_card may still write.
-- Nothing changes for: the organizer's own writes, a group host's writes, a first score
-- in an empty cell, or anyone correcting a score they entered themselves.
BEGIN;
LOCK TABLE public.contests,public.contest_players,public.score_events IN ACCESS EXCLUSIVE MODE;
-- Apply only on top of the exact body this was written against.
DO $guard$ BEGIN
 IF (SELECT md5(p.prosrc) FROM pg_proc p WHERE p.oid='public.submit_score(uuid,uuid,uuid,integer,text,integer,bigint,uuid,text,bigint)'::regprocedure) IS DISTINCT FROM 'b772aa7aaa048cecda62bbc6ba23bf95' THEN
  RAISE EXCEPTION 'submit_score is not the expected version; do not apply';
 END IF;
END $guard$;
CREATE OR REPLACE FUNCTION public.submit_score(contest_id uuid, round_id uuid, player_id uuid, hole integer, action text, strokes integer,
 expected_version bigint, op_id uuid, request_hash text, expected_revision bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c public.contests; uid uuid := auth.uid(); prior public.operation_receipts; cell public.score_events;
 version bigint; fingerprint text; answer jsonb; resolved uuid; allowed boolean;
 reopened boolean; gid uuid; host_uid uuid; is_org boolean;
BEGIN
 SELECT * INTO c FROM public.contests WHERE id=$1 FOR UPDATE;
 IF uid IS NULL OR c.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='FORBIDDEN'; END IF;
 -- WEB RULE 1 (reopen): a finalized round takes corrections for one hour from finalizing,
 -- only from someone who explicitly reopened their card (public.reopen_card).
 reopened := c.status='completed' AND EXISTS(SELECT 1 FROM public.contest_finalizations f JOIN public.card_reopens o ON o.contest_id=f.contest_id
   WHERE f.contest_id=$1 AND o.user_id=uid AND f.finalized_at>now()-interval '1 hour' AND o.reopened_at>=f.finalized_at);
 IF NOT c.sync_enabled OR c.protocol<>1 OR NOT (c.status='active' OR reopened) THEN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='SYNC_PAUSED'; END IF;
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
 -- WEB RULE 2 (group host): whoever takes a group's card first is its host.
 is_org := c.owner_id=uid AND NOT coalesce((auth.jwt()->>'is_anonymous')::boolean,false);
 SELECT a.group_id INTO gid FROM public.round_player_assignments a WHERE a.contest_id=$1 AND a.round_id=resolved AND a.player_id=$3;
 IF gid IS NOT NULL THEN
  host_uid := public.group_card_host($1,resolved,gid);
  IF host_uid IS NULL THEN
   INSERT INTO public.group_card_hosts AS h(contest_id,round_id,group_id,user_id) VALUES($1,resolved,gid,uid)
    ON CONFLICT ON CONSTRAINT group_card_hosts_pkey DO UPDATE SET user_id=excluded.user_id,claimed_at=now();
   host_uid := uid;
  END IF;
 END IF;
 IF version<>$7 OR ($10 IS NOT NULL AND c.sync_revision<>$10) THEN answer := jsonb_build_object('status','conflict','version',version,'strokes',cell.strokes,'revision',c.sync_revision);
 -- WEB RULE 3 (flag): a change to a score someone else entered, by anyone who is neither
 -- the group host nor the organizer, is held for them. The entered score keeps counting.
 -- Answered as a conflict so app versions that do not know flags still show the entered score.
 ELSIF gid IS NOT NULL AND NOT is_org AND host_uid<>uid AND cell.strokes IS NOT NULL AND cell.entered_by IS DISTINCT FROM uid
   AND NOT ($5='set' AND $6=cell.strokes) THEN
  -- One pending proposal per person per cell: asking again replaces their earlier ask.
  UPDATE public.score_flags x SET proposed_action=$5,proposed_strokes=$6,created_at=now()
   WHERE x.contest_id=$1 AND x.round_id=resolved AND x.player_id=$3 AND x.hole=$4 AND x.proposed_by=uid AND x.status='pending';
  IF NOT FOUND THEN
   INSERT INTO public.score_flags(contest_id,round_id,group_id,player_id,hole,proposed_action,proposed_strokes,proposed_by)
    VALUES($1,resolved,gid,$3,$4,$5,$6,uid);
  END IF;
  UPDATE public.contests SET sync_revision=sync_revision+1 WHERE id=$1 RETURNING * INTO c;
  answer := jsonb_build_object('status','conflict','flagged',true,'version',version,'strokes',cell.strokes,'revision',c.sync_revision);
 ELSE
  UPDATE public.contests SET sync_revision=sync_revision+1 WHERE id=$1 RETURNING * INTO c;
  INSERT INTO public.score_events(contest_id,round_id,player_id,hole,action,strokes,entered_by,actor,cell_version,contest_revision,op_id,request_hash)
   VALUES($1,resolved,$3,$4,$5,$6,uid,uid,version+1,c.sync_revision,$8,fingerprint);
  -- A correction after finalizing does not withdraw the group's submitted card.
  IF NOT reopened THEN
  DELETE FROM public.group_submissions s USING public.round_player_assignments a
   WHERE a.contest_id=$1 AND a.round_id=resolved AND a.player_id=$3 AND s.contest_id=a.contest_id AND s.round_id=a.round_id AND s.group_id=a.group_id;
  END IF;
  -- WEB RULE 4 (reconcile): an accepted score that equals a pending proposal settles it.
  UPDATE public.score_flags x SET status='reconciled',resolved_by=uid,resolved_at=now()
   WHERE x.contest_id=$1 AND x.round_id=resolved AND x.player_id=$3 AND x.hole=$4 AND x.status='pending'
   AND x.proposed_action=$5 AND x.proposed_strokes IS NOT DISTINCT FROM $6;
  answer := jsonb_build_object('status','accepted','version',version+1,'strokes',$6,'revision',c.sync_revision);
 END IF;
 INSERT INTO public.operation_receipts(actor,op_id,request_hash,contest_id,result) VALUES(uid,$8,fingerprint,$1,answer);
 RETURN answer;
END $$;
-- The result must be exactly the body reviewed in this file.
DO $guard$ BEGIN
 IF (SELECT md5(p.prosrc) FROM pg_proc p WHERE p.oid='public.submit_score(uuid,uuid,uuid,integer,text,integer,bigint,uuid,text,bigint)'::regprocedure) IS DISTINCT FROM 'bf5629a5461a38fb117c4282ca39c3e1' THEN
  RAISE EXCEPTION 'submit_score did not end as the reviewed body';
 END IF;
END $guard$;
-- WEB RULE 5 (read only, new): when the round was finalized, on the server's clock, and whether
-- the caller has reopened their card. The app and the website use it to show "Reopen" for the
-- hour and "locked" after it without trusting the phone's clock. It changes nothing.
-- SECURITY DEFINER because contest_finalizations and card_reopens are closed to every client
-- role; the body checks the caller is the organizer or an approved member of THIS contest.
-- It is in the public schema because the app can only call functions there; execute is
-- taken from PUBLIC and anon and given to signed-in sessions only.
CREATE FUNCTION public.finalize_window(contest_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c public.contests; uid uuid:=auth.uid(); f timestamptz; r timestamptz;
BEGIN
 SELECT * INTO c FROM public.contests WHERE id=$1;
 IF uid IS NULL OR c.id IS NULL OR NOT ((c.owner_id=uid AND NOT coalesce((auth.jwt()->>'is_anonymous')::boolean,false))
   OR EXISTS(SELECT 1 FROM public.contest_memberships m WHERE m.contest_id=$1 AND m.user_id=uid AND m.status='approved'))
  THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='FORBIDDEN'; END IF;
 IF c.status='completed' THEN SELECT x.finalized_at INTO f FROM public.contest_finalizations x WHERE x.contest_id=$1; END IF;
 IF f IS NOT NULL THEN SELECT o.reopened_at INTO r FROM public.card_reopens o WHERE o.contest_id=$1 AND o.user_id=uid AND o.reopened_at>=f; END IF;
 RETURN jsonb_build_object('finalized_at',f,'now',now(),'reopened_until',CASE WHEN r IS NOT NULL THEN f+interval '1 hour' END);
END $$;
REVOKE ALL ON FUNCTION public.finalize_window(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_window(uuid) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
