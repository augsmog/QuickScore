-- M4b SQL/API authoring only. No live apply or M4a integration is implied.
-- Paired down restores exact post-M3 definitions without deleting accepted events.
BEGIN;
LOCK TABLE public.contests,public.contest_players,public.score_events,public.published_rounds IN ACCESS EXCLUSIVE MODE;
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

-- The frozen M2/M3 signature continues to provide per-cell CAS.
CREATE OR REPLACE FUNCTION public.write_score(contest_id uuid, round_id uuid, player_id uuid, hole integer, action text, strokes integer,
 expected_version bigint, op_id uuid, request_hash text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT public.submit_score($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL);
$$;

-- Every authorization-dependent snapshot holds the same contest lock as mutations.
-- Return a bounded full snapshot, including tombstone versions; never raw row JSON.
CREATE FUNCTION public.fetch_snapshot(contest_id uuid, after_revision bigint DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c public.contests; result jsonb;
BEGIN
 SELECT * INTO c FROM public.contests WHERE id=$1 FOR UPDATE;
 IF auth.uid() IS NULL OR c.id IS NULL OR NOT (
  (c.owner_id=auth.uid() AND NOT coalesce((auth.jwt()->>'is_anonymous')::boolean,false)) OR
  EXISTS(SELECT 1 FROM public.contest_memberships m WHERE m.contest_id=$1 AND m.user_id=auth.uid() AND m.status='approved')
 ) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='FORBIDDEN'; END IF;
 IF $2 IS NULL OR $2<0 OR $2>c.sync_revision THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_REVISION'; END IF;
 SELECT jsonb_build_object('contest_id',c.id,'name',c.name,'capabilities',public.sync_capabilities(c.id),'course',public.sync_course(c.course),'protocol',c.protocol,'revision',c.sync_revision,'completed',c.status='completed','games','[]'::jsonb,
 'rounds',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'number',r.round_number,'name',r.name,'date',r.date,
 'course',public.sync_course(coalesce(r.course_data,c.course)), 'assignment_revision',r.assignment_revision,
 'groups',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'sort_order',g.sort_order) ORDER BY g.sort_order,g.id),'[]'::jsonb) FROM public.contest_groups g WHERE g.contest_id=c.id AND g.round_id=r.id),
 'players',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'displayName',p.name,'handicap',p.handicap,'status',p.status,'team',p.team,
 'group_id',(SELECT a.group_id FROM public.round_player_assignments a WHERE a.contest_id=c.id AND a.round_id=r.id AND a.player_id=p.id),
 'cells',(SELECT jsonb_agg(jsonb_build_object('hole',h,'version',coalesce(e.cell_version,0),'strokes',e.strokes) ORDER BY h)
 FROM generate_series(1,18) h LEFT JOIN LATERAL (
 SELECT x.cell_version,x.strokes FROM public.score_events x WHERE x.contest_id=c.id AND x.round_id=r.id AND x.player_id=p.id AND x.hole=h
 AND x.cell_version IS NOT NULL ORDER BY x.cell_version DESC LIMIT 1) e ON true)) ORDER BY p.sort_order,p.id),'[]'::jsonb)
 FROM public.contest_players p WHERE p.contest_id=c.id)) ORDER BY r.round_number),'[]'::jsonb)
 FROM public.contest_rounds r WHERE r.contest_id=c.id)) INTO result;
 RETURN result || jsonb_build_object('id_map',(SELECT coalesce(jsonb_agg(jsonb_build_object('kind',m.kind,'local_id',m.local_id,'server_id',m.server_id) ORDER BY m.kind,m.local_id),'[]'::jsonb) FROM public.sync_id_map m WHERE m.contest_id=c.id));
END $$;

CREATE FUNCTION public.revoke_membership(contest_id uuid, member_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c public.contests;
BEGIN
 SELECT * INTO c FROM public.contests WHERE id=$1 FOR UPDATE;
 IF c.id IS NULL OR auth.uid() IS NULL OR c.owner_id<>auth.uid() OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN
 RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='HOST_REQUIRED'; END IF;
 IF $2 IS NULL OR $2=c.owner_id THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_MEMBER'; END IF;
 UPDATE public.contest_memberships m SET status='revoked',updated_at=now() WHERE m.contest_id=$1 AND m.user_id=$2;
 UPDATE public.round_scorer_scopes s SET status='revoked' WHERE s.contest_id=$1 AND s.user_id=$2;
 UPDATE public.contest_players p SET user_id=NULL WHERE p.contest_id=$1 AND p.user_id=$2;
 UPDATE public.contests SET sync_revision=sync_revision+1 WHERE id=$1;
 RETURN '{"status":"revoked"}'::jsonb;
END $$;

CREATE OR REPLACE FUNCTION public.decide_join_request(request_id uuid, approve boolean, player_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE cid uuid; c public.contests; r public.contest_join_requests; old_uid uuid;
BEGIN
 SELECT q.contest_id INTO cid FROM public.contest_join_requests q WHERE q.id=$1;
 SELECT * INTO c FROM public.contests WHERE id=cid FOR UPDATE;
 IF c.id IS NULL OR auth.uid() IS NULL OR c.owner_id<>auth.uid() OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN
  RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='HOST_REQUIRED'; END IF;
 IF NOT c.sync_enabled OR c.protocol<>1 OR c.status<>'active' THEN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='SYNC_PAUSED'; END IF;
 SELECT * INTO r FROM public.contest_join_requests q WHERE q.id=$1 FOR UPDATE;
 IF r.status<>'pending' OR approve IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_REQUEST'; END IF;
 IF approve THEN
  IF NOT EXISTS(SELECT 1 FROM public.contest_players p WHERE p.id=$3 AND p.contest_id=cid) THEN
   RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_PLAYER'; END IF;
  IF r.requester=c.owner_id THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='HOST_SLOT'; END IF;
  -- An existing approved identity cannot silently acquire a second slot.
  IF EXISTS(SELECT 1 FROM public.contest_memberships m WHERE m.contest_id=cid AND m.user_id=r.requester AND m.status='approved') THEN
   RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='ALREADY_APPROVED'; END IF;
  SELECT p.user_id INTO old_uid FROM public.contest_players p WHERE p.id=$3;
  UPDATE public.round_scorer_scopes s SET status='revoked' WHERE s.contest_id=cid AND (s.user_id=old_uid OR s.user_id IN (SELECT m.user_id FROM public.contest_memberships m WHERE m.contest_id=cid AND m.player_id=$3));
  UPDATE public.contest_memberships m SET status='revoked',updated_at=now() WHERE m.contest_id=cid
    AND (m.player_id=$3 OR m.user_id=old_uid) AND m.status<>'revoked';
  -- Clear every legacy binding of the previous identity, not just the claimed slot.
  UPDATE public.contest_players p SET user_id=NULL WHERE p.contest_id=cid AND (p.id=$3 OR p.user_id=old_uid);
  INSERT INTO public.contest_memberships(contest_id,user_id,role,player_id,status) VALUES(cid,r.requester,'player',$3,'approved')
   ON CONFLICT (contest_id,user_id) DO UPDATE SET role='player',player_id=excluded.player_id,status='approved',updated_at=now();
 END IF;
 UPDATE public.contest_join_requests q SET status=CASE WHEN approve THEN 'approved' ELSE 'rejected' END,
  desired_player_id=CASE WHEN approve THEN $3 ELSE NULL END,decided_by=auth.uid(),decided_at=now() WHERE q.id=$1;
 UPDATE public.contests SET sync_revision=sync_revision+1 WHERE id=cid;
 RETURN jsonb_build_object('status',CASE WHEN approve THEN 'approved' ELSE 'rejected' END);
END $$;

-- Rejoin remains an explicit request followed by the existing host-approved slot
-- transfer. M2 decide_join_request locks the contest and revokes the old identity.
-- Lock reads of join status and roster against transfer/revoke as well.
CREATE OR REPLACE FUNCTION public.tournament_snapshot(contest_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c public.contests; uid uuid := auth.uid(); rounds jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='AUTH_REQUIRED'; END IF;
  SELECT * INTO c FROM public.contests WHERE id = contest_id FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='FORBIDDEN'; END IF;
  IF NOT (
    (c.owner_id = uid AND NOT coalesce((auth.jwt()->>'is_anonymous')::boolean, false))
    OR EXISTS (SELECT 1 FROM public.contest_memberships m WHERE m.contest_id = c.id AND m.user_id = uid AND m.status = 'approved' AND m.role IN ('host', 'player', 'scorer'))
  ) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='FORBIDDEN'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'number', r.round_number, 'name', r.name,
    'groups', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name,
        'players', (
          SELECT coalesce(jsonb_agg(jsonb_build_object(
            'id', p.id, 'name', p.name,
            'scores', (
              SELECT jsonb_agg(s.strokes ORDER BY gs.hole)
              FROM generate_series(1, 18) AS gs(hole)
              LEFT JOIN LATERAL (
                SELECT e.strokes FROM public.score_events e
                WHERE e.contest_id = c.id AND e.round_id = r.id AND e.player_id = p.id AND e.hole = gs.hole AND e.cell_version IS NOT NULL
                ORDER BY e.cell_version DESC LIMIT 1
              ) s ON true
            )
          ) ORDER BY p.sort_order, p.name), '[]'::jsonb)
          FROM public.round_player_assignments a
          JOIN public.contest_players p ON p.id = a.player_id AND p.contest_id = a.contest_id
          WHERE a.contest_id = c.id AND a.round_id = r.id AND a.group_id = g.id
        )
      ) ORDER BY g.sort_order, g.name), '[]'::jsonb)
      FROM public.contest_groups g WHERE g.contest_id = c.id AND g.round_id = r.id
    )
  ) ORDER BY r.round_number), '[]'::jsonb) INTO rounds
  FROM public.contest_rounds r WHERE r.contest_id = c.id;
  RETURN jsonb_build_object('revision', c.sync_revision, 'rounds', rounds);
END $$;
CREATE OR REPLACE FUNCTION public.list_join_requests(contest_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM 1 FROM public.contests WHERE id=$1 FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.contests c WHERE c.id=$1 AND c.owner_id=auth.uid())
 OR auth.uid() IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN
  RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='HOST_REQUIRED'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.created_at),'[]'::jsonb) FROM public.contest_join_requests r WHERE r.contest_id=$1);
END $$;
CREATE OR REPLACE FUNCTION public.my_membership(contest_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM 1 FROM public.contests WHERE id=$1 FOR UPDATE;
 IF auth.uid() IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='AUTH_REQUIRED'; END IF;
 RETURN (SELECT jsonb_build_object('role',m.role,'status',m.status,'player_id',m.player_id)
 FROM public.contest_memberships m WHERE m.contest_id=$1 AND m.user_id=auth.uid());
END $$;

-- Keep the legacy shape and flags-off publish/get/chat signatures; game-unit
-- standings are never a spectator field, including for legacy links.
CREATE OR REPLACE FUNCTION public.sanitize_shared_round(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare players jsonb; games jsonb;
begin
  if jsonb_typeof(p->'players') is distinct from 'array' or jsonb_array_length(p->'players') > 40
    or jsonb_typeof(p->'games') is distinct from 'array' or jsonb_array_length(p->'games') > 30 then
    raise exception 'invalid snapshot';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'displayName', left(x->>'displayName',80),
    'scores', (select coalesce(jsonb_agg((n::text)::integer order by ord), '[]'::jsonb)
      from jsonb_array_elements(x->'scores') with ordinality as s(n,ord)
      where ord <= 18 and jsonb_typeof(n) = 'number' and n::text ~ '^[0-9]{1,2}$'),
    'total', (x->>'total')::integer, 'toPar', (x->>'toPar')::integer
  )), '[]'::jsonb) into players from jsonb_array_elements(p->'players') x;
  select coalesce(jsonb_agg(jsonb_build_object(
    'game', left(x->>'game',40),
    'standings', (select coalesce(jsonb_agg(jsonb_build_object(
      'displayName', left(s->>'displayName',80), 'units', (s->>'units')::numeric)), '[]'::jsonb)
      from jsonb_array_elements(x->'standings') s)
  )), '[]'::jsonb) into games from jsonb_array_elements(p->'games') x;
  return jsonb_build_object('completed', coalesce((p->>'completed')::boolean,false), 'players', players, 'games', '[]'::jsonb);
end $function$;

-- Immutable event log -> default-round array cache in the same transaction.
-- Published snapshots for protocol 1 are fetched from the canonical projection
-- by get_shared_round, so legacy uploads cannot choose a winner.
CREATE FUNCTION public.sync_legacy_projection(cid uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('completed',c.status='completed','games','[]'::jsonb,'players',
 (SELECT coalesce(jsonb_agg(jsonb_build_object('displayName',p.name,'scores',to_jsonb(p.scores),
 'total',(SELECT coalesce(sum(v),0) FROM unnest(p.scores) v),'toPar',0) ORDER BY p.sort_order,p.id),'[]'::jsonb)
 FROM public.contest_players p WHERE p.contest_id=c.id)) FROM public.contests c WHERE c.id=$1;
$$;
CREATE OR REPLACE FUNCTION public.guard_sync_legacy() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE cid uuid; p smallint;
BEGIN
 cid := CASE WHEN TG_OP='DELETE' THEN OLD.contest_id ELSE NEW.contest_id END;
 SELECT protocol INTO p FROM public.contests WHERE id=cid FOR UPDATE;
 IF p=1 THEN
  IF TG_OP='UPDATE' AND pg_trigger_depth()>1 AND
   (to_jsonb(NEW)-'snapshot')=(to_jsonb(OLD)-'snapshot') AND NEW.snapshot=public.sync_legacy_projection(cid) THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND pg_trigger_depth()>1 AND OLD.ended_at IS NULL AND NEW.ended_at=now() AND
   (to_jsonb(NEW)-'snapshot'-'ended_at')=(to_jsonb(OLD)-'snapshot'-'ended_at') AND NEW.snapshot=public.sync_legacy_projection(cid) AND EXISTS(SELECT 1 FROM public.contests c WHERE c.id=cid AND c.status='completed') THEN RETURN NEW; END IF;
  RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='LEGACY_PROTOCOL';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
REVOKE ALL ON FUNCTION public.sync_legacy_projection(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.publish_shared_round(p_local_id text, p_snapshot jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare r public.published_rounds; cid uuid; clean jsonb; ended timestamptz;
begin
  perform 1 from public.contests c join public.published_rounds pr on pr.contest_id=c.id
    where pr.owner_id=auth.uid() and pr.local_id=p_local_id for update of c;
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'owner required'; end if;
  if length(p_local_id) not between 1 and 200 or pg_column_size(p_snapshot) > 100000 then raise exception 'invalid snapshot'; end if;
  -- Serialize creation and updates for a local contest, including across devices.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || p_local_id,0));
  clean := public.sanitize_shared_round(p_snapshot);
  select * into r from public.published_rounds where owner_id = auth.uid() and local_id = p_local_id for update;
  if found then
    cid := r.contest_id;
    if not exists(select 1 from public.contests where id = cid and owner_id = auth.uid()) then raise exception 'owner required'; end if;
    ended := r.ended_at;
  else
    insert into public.contests(owner_id,name,course,invite_code)
      values(auth.uid(),'Shared round','{}'::jsonb,translate(upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)),'01','GH')) returning id into cid;
  end if;
  if (clean->>'completed')::boolean and ended is null then ended := now(); end if;
  insert into public.published_rounds(contest_id,owner_id,local_id,snapshot,ended_at)
    values(cid,auth.uid(),p_local_id,clean,ended)
    on conflict(contest_id) do update set snapshot=excluded.snapshot, ended_at=excluded.ended_at, updated_at=now();
  -- Active links have no scheduled round end. Completion fixes their expiry once.
  if ended is not null then update public.share_links set expires_at=least(expires_at,ended + interval '7 days') where contest_id=cid; end if;
end $function$;
CREATE OR REPLACE FUNCTION public.create_share_link(p_local_id text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare r public.published_rounds; token text;
begin
  perform 1 from public.contests c join public.published_rounds pr on pr.contest_id=c.id
    where pr.owner_id=auth.uid() and pr.local_id=p_local_id for update of c;
  select * into r from public.published_rounds where owner_id=auth.uid() and local_id=p_local_id for update;
  if not found or not exists(select 1 from public.contests where id=r.contest_id and owner_id=auth.uid()) then raise exception 'owner required'; end if;
  if r.ended_at + interval '7 days' <= now() then raise exception 'round expired'; end if;
  token := encode(extensions.gen_random_bytes(32),'hex');
  insert into public.share_links(token_hash,contest_id,expires_at)
    values(encode(sha256(convert_to(token,'UTF8')),'hex'),r.contest_id,coalesce(r.ended_at + interval '7 days','infinity'::timestamptz));
  return token;
end $function$;
CREATE OR REPLACE FUNCTION public.revoke_share_links(p_local_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare cid uuid;
begin
  perform 1 from public.contests c join public.published_rounds pr on pr.contest_id=c.id
    where pr.owner_id=auth.uid() and pr.local_id=p_local_id for update of c;
  select r.contest_id into cid from public.published_rounds r join public.contests c on c.id=r.contest_id
    where r.owner_id=auth.uid() and c.owner_id=auth.uid() and r.local_id=p_local_id for update of r;
  if cid is null then raise exception 'owner required'; end if;
  update public.share_links set revoked_at=now() where contest_id=cid and revoked_at is null;
end $function$;
CREATE OR REPLACE FUNCTION public.get_shared_round(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare link public.share_links; snapshot jsonb;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'invalid link'; end if;
  -- Resolve locator without granting data, lock contest, then revalidate capability.
  perform 1 from public.contests c join public.share_links l on l.contest_id=c.id
    where l.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update of c;
  select * into link from public.share_links where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
  if not found then raise exception 'invalid link'; end if;
  if link.revoked_at is not null then raise exception 'revoked link'; end if;
  if link.expires_at <= now() then raise exception 'expired link'; end if;
  select r.snapshot into snapshot from public.published_rounds r where r.contest_id=link.contest_id;
  if exists(select 1 from public.contests c where c.id=link.contest_id and c.protocol=1)
    and exists(select 1 from public.score_events e where e.contest_id=link.contest_id and e.cell_version is not null) then
    snapshot := public.sync_legacy_projection(link.contest_id);
  end if;
  return public.sanitize_shared_round(snapshot);
end $function$;
-- Rebuild existing M3 accepted data before enabling the API. Never alter its log.
UPDATE public.contest_players p SET scores=(SELECT array_agg(coalesce(e.strokes,0) ORDER BY h)
 FROM generate_series(1,18) h LEFT JOIN LATERAL (
 SELECT x.strokes FROM public.score_events x JOIN public.contest_rounds r ON r.id=x.round_id AND r.contest_id=x.contest_id AND r.round_number=1
 WHERE x.contest_id=p.contest_id AND x.player_id=p.id AND x.hole=h AND x.cell_version IS NOT NULL ORDER BY x.cell_version DESC LIMIT 1) e ON true)
 WHERE EXISTS(SELECT 1 FROM public.contests c WHERE c.id=p.contest_id AND c.protocol=1)
 AND EXISTS(SELECT 1 FROM public.score_events x JOIN public.contest_rounds r ON r.id=x.round_id AND r.contest_id=x.contest_id AND r.round_number=1
 WHERE x.contest_id=p.contest_id AND x.player_id=p.id AND x.cell_version IS NOT NULL);
-- The table lock covers this one-time rebuild; clients cannot observe/bypass the
-- legacy guard while it is disabled inside this transaction.
ALTER TABLE public.published_rounds DISABLE TRIGGER m2_publish_guard;
UPDATE public.published_rounds pr SET snapshot=public.sync_legacy_projection(pr.contest_id)
 WHERE EXISTS(SELECT 1 FROM public.contests c WHERE c.id=pr.contest_id AND c.protocol=1)
 AND EXISTS(SELECT 1 FROM public.score_events e WHERE e.contest_id=pr.contest_id AND e.cell_version IS NOT NULL);
ALTER TABLE public.published_rounds ENABLE TRIGGER m2_publish_guard;

CREATE FUNCTION public.sync_score_cache() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.cell_version IS NOT NULL AND EXISTS(SELECT 1 FROM public.contest_rounds r WHERE r.id=NEW.round_id AND r.contest_id=NEW.contest_id AND r.round_number=1) THEN
  UPDATE public.contest_players p SET scores=(SELECT array_agg(coalesce(e.strokes,0) ORDER BY h)
   FROM generate_series(1,18) h LEFT JOIN LATERAL (
    SELECT x.strokes FROM public.score_events x WHERE x.contest_id=NEW.contest_id AND x.round_id=NEW.round_id AND x.player_id=NEW.player_id AND x.hole=h
    AND x.cell_version IS NOT NULL ORDER BY x.cell_version DESC LIMIT 1) e ON true)
  WHERE p.id=NEW.player_id AND p.contest_id=NEW.contest_id;
 END IF;
 IF NEW.cell_version IS NOT NULL THEN
  UPDATE public.published_rounds SET snapshot=public.sync_legacy_projection(NEW.contest_id) WHERE contest_id=NEW.contest_id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER m4b_score_cache AFTER INSERT ON public.score_events FOR EACH ROW EXECUTE FUNCTION public.sync_score_cache();

-- Private Broadcast carries only a monotonic revision. Transactional realtime.send
-- publishes after commit. No raw events enter a new public channel.
CREATE FUNCTION public.sync_revision_hint() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.protocol=1 AND NEW.status='completed' AND OLD.status<>'completed' THEN
  UPDATE public.published_rounds SET ended_at=coalesce(ended_at,now()),snapshot=public.sync_legacy_projection(NEW.id) WHERE contest_id=NEW.id;
  UPDATE public.share_links SET expires_at=least(expires_at,now()+interval '7 days') WHERE contest_id=NEW.id;
 END IF;
 IF NEW.protocol=1 AND NEW.sync_revision<>OLD.sync_revision THEN
  PERFORM realtime.send(jsonb_build_object('revision',NEW.sync_revision),'revision','snapscore:'||NEW.id::text,true);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER m4b_revision_hint AFTER UPDATE ON public.contests FOR EACH ROW EXECUTE FUNCTION public.sync_revision_hint();
CREATE FUNCTION public.can_receive_sync(topic text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM public.contests c WHERE 'snapscore:'||c.id::text=$1 AND c.protocol=1 AND auth.uid() IS NOT NULL
 AND ((c.owner_id=auth.uid() AND NOT coalesce((auth.jwt()->>'is_anonymous')::boolean,false)) OR
 EXISTS(SELECT 1 FROM public.contest_memberships m WHERE m.contest_id=c.id AND m.user_id=auth.uid() AND m.status='approved')));
$$;
CREATE POLICY m4b_receive ON realtime.messages FOR SELECT TO authenticated
 USING(extension='broadcast' AND public.can_receive_sync(realtime.topic()));
-- Restrictive guards prevent another permissive policy from widening our topic.
CREATE POLICY m4b_receive_guard ON realtime.messages AS RESTRICTIVE FOR SELECT TO authenticated
 USING(realtime.topic() NOT LIKE 'snapscore:%' OR public.can_receive_sync(realtime.topic()));
CREATE POLICY m4b_send_guard ON realtime.messages AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK(realtime.topic() NOT LIKE 'snapscore:%');
REVOKE ALL ON FUNCTION public.submit_score(uuid,uuid,uuid,integer,text,integer,bigint,uuid,text,bigint),
 public.fetch_snapshot(uuid,bigint),public.revoke_membership(uuid,uuid),public.sync_score_cache(),public.sync_revision_hint(),public.can_receive_sync(text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.submit_score(uuid,uuid,uuid,integer,text,integer,bigint,uuid,text,bigint),
 public.fetch_snapshot(uuid,bigint),public.revoke_membership(uuid,uuid),public.can_receive_sync(text) TO authenticated,service_role;
-- Pilot enrollment is explicit and host-only. Historical/nonempty imports require
-- the reviewed integration importer; ambiguity must never pick a score winner.
CREATE FUNCTION public.enroll_contest(contest_id uuid, expected_revision bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c public.contests;
BEGIN
 SELECT * INTO c FROM public.contests WHERE id=$1 FOR UPDATE;
 IF c.id IS NULL OR auth.uid() IS NULL OR c.owner_id<>auth.uid() OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN
 RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='HOST_REQUIRED'; END IF;
 IF $2 IS NULL OR c.sync_revision<>$2 OR c.status<>'active' THEN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='ENROLLMENT_CONFLICT'; END IF;
 IF c.protocol=1 THEN RETURN jsonb_build_object('protocol',1,'revision',c.sync_revision,'enabled',c.sync_enabled); END IF;
 IF EXISTS(SELECT 1 FROM public.score_events WHERE public.score_events.contest_id=c.id)
 OR EXISTS(SELECT 1 FROM public.contest_players p WHERE p.contest_id=c.id AND EXISTS(SELECT 1 FROM unnest(p.scores) v WHERE v<>0))
 OR EXISTS(SELECT 1 FROM public.published_rounds pr WHERE pr.contest_id=c.id AND jsonb_array_length(pr.snapshot->'players')>0) THEN
 RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='IMPORT_REVIEW_REQUIRED'; END IF;
 UPDATE public.contests SET protocol=1,sync_enabled=true WHERE id=c.id;
 RETURN jsonb_build_object('protocol',1,'revision',c.sync_revision,'enabled',true);
END $$;
CREATE FUNCTION public.sync_capabilities(contest_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c public.contests;
BEGIN
 SELECT * INTO c FROM public.contests WHERE id=$1 FOR UPDATE;
 IF c.id IS NULL OR auth.uid() IS NULL OR NOT ((c.owner_id=auth.uid() AND NOT coalesce((auth.jwt()->>'is_anonymous')::boolean,false)) OR
 EXISTS(SELECT 1 FROM public.contest_memberships m WHERE m.contest_id=$1 AND m.user_id=auth.uid() AND m.status='approved')) THEN
 RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='FORBIDDEN'; END IF;
 RETURN jsonb_build_object('api_version',1,'contract','snapscore-sync-v1','protocol',c.protocol,'enabled',c.sync_enabled AND c.protocol=1 AND c.status='active','revision',c.sync_revision,'channel',jsonb_build_object('topic','snapscore:'||c.id::text,'private',true,'event','revision'));
END $$;
REVOKE ALL ON FUNCTION public.enroll_contest(uuid,bigint),public.sync_capabilities(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enroll_contest(uuid,bigint),public.sync_capabilities(uuid) TO authenticated,service_role;


-- No locator input: only records belonging to this JWT identity are discoverable.
CREATE FUNCTION public.my_sync_status() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='AUTH_REQUIRED'; END IF;
 RETURN jsonb_build_object('api_version',1,
 'memberships',(SELECT coalesce(jsonb_agg(jsonb_build_object('contest_id',m.contest_id,'role',m.role,'status',m.status,'player_id',m.player_id) ORDER BY m.contest_id),'[]'::jsonb) FROM public.contest_memberships m WHERE m.user_id=auth.uid()),
 'requests',(SELECT coalesce(jsonb_agg(jsonb_build_object('request_id',q.id,'status',q.status,
 'contest_id',CASE WHEN EXISTS(SELECT 1 FROM public.contest_memberships m WHERE m.contest_id=q.contest_id AND m.user_id=auth.uid() AND m.status='approved') THEN q.contest_id ELSE NULL END) ORDER BY q.created_at,q.id),'[]'::jsonb) FROM public.contest_join_requests q WHERE q.requester=auth.uid()));
END $$;
-- Course projection excludes provider/location/contact/money extensions.
CREATE FUNCTION public.sync_course(course jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('name',CASE WHEN jsonb_typeof($1->'name')='string' THEN left($1->>'name',200) END,'holes',
 (SELECT coalesce(jsonb_agg(jsonb_build_object('num',CASE WHEN jsonb_typeof(h->'num')='number' THEN h->'num' END,'par',CASE WHEN jsonb_typeof(h->'par')='number' THEN h->'par' END,'hcp',CASE WHEN jsonb_typeof(h->'hcp')='number' THEN h->'hcp' END,'yards',CASE WHEN jsonb_typeof(h->'yards')='number' THEN h->'yards' END) ORDER BY ord),'[]'::jsonb)
 FROM jsonb_array_elements(CASE WHEN jsonb_typeof($1->'holes')='array' THEN $1->'holes' ELSE '[]'::jsonb END) WITH ORDINALITY a(h,ord) WHERE ord<=18));
$$;
REVOKE ALL ON FUNCTION public.my_sync_status(),public.sync_course(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.my_sync_status() TO authenticated,service_role;

-- Pending M4b integration: all checks occur after the common contest lock.
CREATE FUNCTION public.submit_group(contest_id uuid, round_id uuid, group_id uuid, expected_revision bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c public.contests; r public.contest_rounds; score_rev bigint;
BEGIN
 SELECT * INTO c FROM public.contests WHERE id=$1 FOR UPDATE;
 IF auth.uid() IS NULL OR c.id IS NULL OR NOT (
 (c.owner_id=auth.uid() AND NOT coalesce((auth.jwt()->>'is_anonymous')::boolean,false)) OR
 EXISTS(SELECT 1 FROM public.contest_memberships m JOIN public.round_scorer_scopes s ON s.contest_id=m.contest_id AND s.user_id=m.user_id
 WHERE m.contest_id=$1 AND m.user_id=auth.uid() AND m.role='scorer' AND m.status='approved' AND s.status='approved' AND s.round_id=$2 AND s.group_id=$3))
 THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='SCORER_REQUIRED'; END IF;
 IF NOT c.sync_enabled OR c.protocol<>1 OR c.status<>'active' THEN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='SYNC_PAUSED'; END IF;
 IF $4 IS NULL OR $4<>c.sync_revision THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='REVISION_CONFLICT'; END IF;
 SELECT * INTO r FROM public.contest_rounds cr WHERE cr.id=$2 AND cr.contest_id=$1;
 IF r.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.contest_groups g WHERE g.id=$3 AND g.round_id=$2 AND g.contest_id=$1)
 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_GROUP'; END IF;
 -- A missing course/assignment/cell or a clear cannot certify a completed card.
 IF jsonb_array_length(public.sync_course(coalesce(r.course_data,c.course))->'holes')=0 OR
 NOT EXISTS(SELECT 1 FROM public.round_player_assignments a JOIN public.contest_players p ON p.id=a.player_id WHERE a.contest_id=$1 AND a.round_id=$2 AND a.group_id=$3 AND p.status='active') OR
 EXISTS(SELECT 1 FROM public.round_player_assignments a JOIN public.contest_players p ON p.id=a.player_id
 CROSS JOIN LATERAL jsonb_array_elements(public.sync_course(coalesce(r.course_data,c.course))->'holes') h
 LEFT JOIN LATERAL (SELECT e.strokes FROM public.score_events e WHERE e.contest_id=$1 AND e.round_id=$2 AND e.player_id=a.player_id AND e.hole=(h->>'num')::integer AND e.cell_version IS NOT NULL ORDER BY e.cell_version DESC LIMIT 1) cell ON true
 WHERE a.contest_id=$1 AND a.round_id=$2 AND a.group_id=$3 AND p.status='active' AND cell.strokes IS NULL)
 THEN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='INCOMPLETE_GROUP'; END IF;
 SELECT coalesce(max(e.contest_revision),0) INTO score_rev FROM public.score_events e JOIN public.round_player_assignments a ON a.contest_id=e.contest_id AND a.round_id=e.round_id AND a.player_id=e.player_id WHERE a.contest_id=$1 AND a.round_id=$2 AND a.group_id=$3;
 INSERT INTO public.group_submissions(contest_id,round_id,group_id,score_revision,assignment_revision,submitted_by)
 VALUES($1,$2,$3,score_rev,r.assignment_revision,auth.uid()) ON CONFLICT ON CONSTRAINT group_submissions_pkey DO UPDATE
 SET score_revision=excluded.score_revision,assignment_revision=excluded.assignment_revision,submitted_by=excluded.submitted_by,submitted_at=now();
 UPDATE public.contests SET sync_revision=sync_revision+1 WHERE id=$1 RETURNING * INTO c;
 RETURN jsonb_build_object('status','submitted','revision',c.sync_revision);
END $$;
CREATE FUNCTION public.finalize_tournament(contest_id uuid, expected_revision bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c public.contests;
BEGIN
 SELECT * INTO c FROM public.contests WHERE id=$1 FOR UPDATE;
 IF auth.uid() IS NULL OR c.id IS NULL OR c.owner_id<>auth.uid() OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
 THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='HOST_REQUIRED'; END IF;
 IF NOT c.sync_enabled OR c.protocol<>1 OR c.status<>'active' THEN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='SYNC_PAUSED'; END IF;
 IF $2 IS NULL OR $2<>c.sync_revision THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='REVISION_CONFLICT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.contest_groups cg WHERE cg.contest_id=$1) OR
 EXISTS(SELECT 1 FROM public.contest_rounds r WHERE r.contest_id=$1 AND NOT EXISTS(SELECT 1 FROM public.contest_groups g WHERE g.round_id=r.id)) OR
 EXISTS(SELECT 1 FROM public.contest_rounds r CROSS JOIN public.contest_players p WHERE r.contest_id=$1 AND p.contest_id=$1 AND p.status='active' AND NOT EXISTS(SELECT 1 FROM public.round_player_assignments a WHERE a.contest_id=$1 AND a.round_id=r.id AND a.player_id=p.id)) OR
 EXISTS(SELECT 1 FROM public.contest_groups g JOIN public.contest_rounds r ON r.id=g.round_id
 LEFT JOIN public.group_submissions s ON s.contest_id=g.contest_id AND s.round_id=g.round_id AND s.group_id=g.id
 WHERE g.contest_id=$1 AND (s.group_id IS NULL OR NOT (s.submitted_by=c.owner_id OR EXISTS(SELECT 1 FROM public.contest_memberships m JOIN public.round_scorer_scopes sc ON sc.contest_id=m.contest_id AND sc.user_id=m.user_id WHERE m.contest_id=$1 AND m.user_id=s.submitted_by AND m.role='scorer' AND m.status='approved' AND sc.round_id=g.round_id AND sc.group_id=g.id AND sc.status='approved')) OR s.assignment_revision<>r.assignment_revision OR s.score_revision<>
 (SELECT coalesce(max(e.contest_revision),0) FROM public.score_events e JOIN public.round_player_assignments a ON a.contest_id=e.contest_id AND a.round_id=e.round_id AND a.player_id=e.player_id WHERE a.contest_id=$1 AND a.round_id=g.round_id AND a.group_id=g.id)))
 THEN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='SUBMISSIONS_REQUIRED'; END IF;
 UPDATE public.contests SET status='completed',sync_revision=sync_revision+1 WHERE id=$1 RETURNING * INTO c;
 -- Freeze GS14's deadline at first completion; later link creation cannot extend it.
 -- Completion projection/expiry is updated inside the contest trigger.
 RETURN jsonb_build_object('status','completed','revision',c.sync_revision);
END $$;
REVOKE ALL ON FUNCTION public.submit_group(uuid,uuid,uuid,bigint),public.finalize_tournament(uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.submit_group(uuid,uuid,uuid,bigint),public.finalize_tournament(uuid,bigint) TO authenticated,service_role;

-- Private bounded-window counters; no caller-supplied IP or budget scope.
CREATE TABLE public.sync_join_budgets(scope text PRIMARY KEY, window_start timestamptz NOT NULL, attempts integer NOT NULL CHECK(attempts BETWEEN 0 AND 301));
ALTER TABLE public.sync_join_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_join_budgets FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.sync_join_budgets FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.sync_join_budgets TO service_role;
CREATE OR REPLACE FUNCTION public.request_join(code text, display_name text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE cid uuid; uid uuid:=auth.uid(); n integer; bucket timestamptz:=date_trunc('minute',clock_timestamp()); k text;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='AUTH_REQUIRED'; END IF;
 IF display_name IS NULL OR length(btrim(display_name)) NOT BETWEEN 1 AND 80 OR code IS NULL OR length(code)>32 THEN
 RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_REQUEST'; END IF;
 -- One shared budget covers fresh identities and nonexistent codes. Generic
 -- responses commit the counters; raising an exception would roll them back.
 FOREACH k IN ARRAY ARRAY['global','actor:'||uid::text] LOOP
 INSERT INTO public.sync_join_budgets AS b VALUES(k,bucket,1) ON CONFLICT(scope) DO UPDATE SET
 attempts=CASE WHEN b.window_start=bucket THEN least(b.attempts+1,301) ELSE 1 END,window_start=bucket RETURNING attempts INTO n;
 IF n>(CASE WHEN k='global' THEN 300 ELSE 5 END) THEN RETURN '{"status":"pending"}'::jsonb; END IF;
 END LOOP;
 SELECT id INTO cid FROM public.contests WHERE invite_code=upper(btrim(code)) AND protocol=1 AND sync_enabled AND status='active' FOR UPDATE;
 IF cid IS NOT NULL THEN
 k:='event:'||cid::text;
 INSERT INTO public.sync_join_budgets AS b VALUES(k,bucket,1) ON CONFLICT(scope) DO UPDATE SET
 attempts=CASE WHEN b.window_start=bucket THEN least(b.attempts+1,301) ELSE 1 END,window_start=bucket RETURNING attempts INTO n;
 IF n<=60 THEN
 INSERT INTO public.contest_join_requests(contest_id,requester,requested_name) VALUES(cid,uid,btrim(display_name)) ON CONFLICT (contest_id,requester) WHERE status='pending' DO NOTHING;
 END IF;
 END IF;
 RETURN '{"status":"pending"}'::jsonb;
END $$;

CREATE FUNCTION public.guard_sync_completion() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF OLD.protocol=1 AND NEW.status IS DISTINCT FROM OLD.status AND current_user NOT IN ('postgres','service_role') THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='USE_FINALIZE_RPC'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_sync_completion() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER m4b_completion_guard BEFORE UPDATE ON public.contests FOR EACH ROW EXECUTE FUNCTION public.guard_sync_completion();

COMMIT;
