-- Schema down is allowed only before enrollment/accepted protocol writes.
-- Lock before inspecting/restoring; a concurrent writer cannot straddle the down.
BEGIN;
LOCK TABLE public.contests,public.score_events,public.contest_players,public.contest_memberships,public.operation_receipts IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.contests WHERE protocol=1)
 OR EXISTS(SELECT 1 FROM public.score_events WHERE cell_version IS NOT NULL)
 OR EXISTS(SELECT 1 FROM public.operation_receipts) THEN
 RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='M4B_DOWN_UNSAFE: use operational pause and fix forward';
 END IF;
END $$;
DROP FUNCTION public.submit_group(uuid,uuid,uuid,bigint),public.finalize_tournament(uuid,bigint);
CREATE OR REPLACE FUNCTION public.request_join(code text, display_name text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE cid uuid; uid uuid := auth.uid();
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='AUTH_REQUIRED'; END IF;
 IF display_name IS NULL OR length(btrim(display_name)) NOT BETWEEN 1 AND 80 OR code IS NULL OR length(code)>32 THEN
  RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_REQUEST'; END IF;
 SELECT id INTO cid FROM public.contests WHERE invite_code=upper(btrim(code)) AND protocol=1 AND sync_enabled AND status='active' FOR UPDATE;
 IF cid IS NOT NULL THEN
  INSERT INTO public.contest_join_requests(contest_id,requester,requested_name) VALUES(cid,uid,btrim(display_name))
   ON CONFLICT (contest_id,requester) WHERE status='pending' DO NOTHING;
 END IF;
 -- Unknown and disabled codes intentionally have the identical public result.
 RETURN '{"status":"pending"}'::jsonb;
END $$;

DROP TABLE public.sync_join_budgets;
DROP TRIGGER m4b_completion_guard ON public.contests;
DROP FUNCTION public.guard_sync_completion();
DROP POLICY m4b_receive ON realtime.messages;
DROP POLICY m4b_receive_guard ON realtime.messages;
DROP POLICY m4b_send_guard ON realtime.messages;
DROP TRIGGER m4b_score_cache ON public.score_events;
DROP TRIGGER m4b_revision_hint ON public.contests;
CREATE OR REPLACE FUNCTION public.write_score(contest_id uuid, round_id uuid, player_id uuid, hole integer, action text, strokes integer,
 expected_version bigint, op_id uuid, request_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
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
 OR $7 IS NULL OR $7<0 OR $8 IS NULL OR $9 IS NULL OR length($9) NOT BETWEEN 1 AND 256 THEN
  RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_SCORE'; END IF;
 fingerprint := encode(extensions.digest(jsonb_build_array($1,$2,$3,$4,$5,$6,$7,$9)::text,'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text||':'||$8::text,0));
 SELECT * INTO prior FROM public.operation_receipts r WHERE r.actor=uid AND r.op_id=$8 FOR UPDATE;
 IF FOUND THEN
  IF prior.contest_id<>$1 OR prior.request_hash<>fingerprint THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='OP_REUSED'; END IF;
  RETURN prior.result;
 END IF;
 SELECT * INTO cell FROM public.score_events e WHERE e.contest_id=$1 AND e.round_id = resolved AND e.player_id=$3 AND e.hole=$4
 AND e.cell_version IS NOT NULL ORDER BY e.cell_version DESC LIMIT 1 FOR UPDATE;
 version := coalesce(cell.cell_version,0);
 IF version<>$7 THEN answer := jsonb_build_object('status','conflict','version',version,'strokes',cell.strokes,'revision',c.sync_revision);
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
CREATE OR REPLACE FUNCTION public.tournament_snapshot(contest_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c public.contests; uid uuid := auth.uid(); rounds jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='AUTH_REQUIRED'; END IF;
  SELECT * INTO c FROM public.contests WHERE id = contest_id;
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
 IF NOT EXISTS(SELECT 1 FROM public.contests c WHERE c.id=$1 AND c.owner_id=auth.uid())
 OR auth.uid() IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN
  RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='HOST_REQUIRED'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.created_at),'[]'::jsonb) FROM public.contest_join_requests r WHERE r.contest_id=$1);
END $$;
CREATE OR REPLACE FUNCTION public.my_membership(contest_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='AUTH_REQUIRED'; END IF;
 RETURN (SELECT jsonb_build_object('role',m.role,'status',m.status,'player_id',m.player_id)
 FROM public.contest_memberships m WHERE m.contest_id=$1 AND m.user_id=auth.uid());
END $$;
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
  return jsonb_build_object('completed', coalesce((p->>'completed')::boolean,false), 'players', players, 'games', games);
end $function$;
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
  UPDATE public.contest_memberships m SET status='revoked',updated_at=now() WHERE m.contest_id=cid
    AND (m.player_id=$3 OR m.user_id=old_uid) AND m.status<>'revoked';
  -- Clear every legacy binding of the previous identity, not just the claimed slot.
  UPDATE public.contest_players p SET user_id=NULL WHERE p.contest_id=cid AND (p.id=$3 OR p.user_id=old_uid);
  INSERT INTO public.contest_memberships(contest_id,user_id,role,player_id,status) VALUES(cid,r.requester,'player',$3,'approved')
   ON CONFLICT (contest_id,user_id) DO UPDATE SET role='player',player_id=excluded.player_id,status='approved',updated_at=now();
 END IF;
 UPDATE public.contest_join_requests q SET status=CASE WHEN approve THEN 'approved' ELSE 'rejected' END,
  desired_player_id=CASE WHEN approve THEN $3 ELSE NULL END,decided_by=auth.uid(),decided_at=now() WHERE q.id=$1;
 RETURN jsonb_build_object('status',CASE WHEN approve THEN 'approved' ELSE 'rejected' END);
END $$;
DROP FUNCTION public.submit_score(uuid,uuid,uuid,integer,text,integer,bigint,uuid,text,bigint);
DROP FUNCTION public.fetch_snapshot(uuid,bigint);
DROP FUNCTION public.my_sync_status();
DROP FUNCTION public.sync_course(jsonb);
DROP FUNCTION public.revoke_membership(uuid,uuid);
CREATE OR REPLACE FUNCTION public.guard_sync_legacy() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE cid uuid; p smallint;
BEGIN
 cid := CASE WHEN TG_OP='DELETE' THEN OLD.contest_id ELSE NEW.contest_id END;
 SELECT protocol INTO p FROM public.contests WHERE id=cid FOR UPDATE;
 IF p=1 THEN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='LEGACY_PROTOCOL'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
DROP FUNCTION public.sync_score_cache();
CREATE OR REPLACE FUNCTION public.publish_shared_round(p_local_id text, p_snapshot jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare r public.published_rounds; cid uuid; clean jsonb; ended timestamptz;
begin
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
  select * into r from public.published_rounds where owner_id=auth.uid() and local_id=p_local_id for update;
  if not found or not exists(select 1 from public.contests where id=r.contest_id and owner_id=auth.uid()) then raise exception 'owner required'; end if;
  if r.ended_at + interval '7 days' <= now() then raise exception 'round expired'; end if;
  token := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
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
  select * into link from public.share_links where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
  if not found then raise exception 'invalid link'; end if;
  if link.revoked_at is not null then raise exception 'revoked link'; end if;
  if link.expires_at <= now() then raise exception 'expired link'; end if;
  select r.snapshot into snapshot from public.published_rounds r where r.contest_id=link.contest_id;
  return public.sanitize_shared_round(snapshot);
end $function$;
DROP FUNCTION public.sync_legacy_projection(uuid);
DROP FUNCTION public.sync_revision_hint();
DROP FUNCTION public.can_receive_sync(text);
DROP FUNCTION public.enroll_contest(uuid,bigint);
DROP FUNCTION public.sync_capabilities(uuid);
COMMIT;
