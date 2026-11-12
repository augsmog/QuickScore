-- M2 only: no round/group schema or enrollment endpoint. See M2-FOUNDATION.md.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
-- PUBLIC EXECUTE is a global built-in default: a schema REVOKE cannot remove it.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC;
-- Existing fully qualified relations + catalog builtins only; no extension lookup.
ALTER FUNCTION public.calculate_retention(integer) SET search_path = pg_catalog, public;
ALTER FUNCTION public.get_dau() SET search_path = pg_catalog, public;
ALTER FUNCTION public.get_mau() SET search_path = pg_catalog, public;
ALTER FUNCTION public.handle_new_user() SET search_path = pg_catalog, public;
ALTER FUNCTION public.handle_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.increment_daily_revenue(date,integer) SET search_path = pg_catalog, public;
ALTER FUNCTION public.increment_daily_signups(date) SET search_path = pg_catalog, public;

ALTER TABLE public.contests ADD COLUMN sync_revision bigint NOT NULL DEFAULT 0 CHECK (sync_revision >= 0),
 ADD COLUMN protocol smallint NOT NULL DEFAULT 0 CHECK (protocol IN (0,1)),
 ADD COLUMN sync_enabled boolean NOT NULL DEFAULT false;
CREATE TABLE public.contest_memberships (
 contest_id uuid NOT NULL REFERENCES public.contests ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users,
 role text NOT NULL CHECK (role IN ('host','player','scorer','viewer')),
 player_id uuid REFERENCES public.contest_players,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','revoked')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (contest_id,user_id), CHECK (role <> 'player' OR player_id IS NOT NULL)
);
CREATE UNIQUE INDEX contest_memberships_active_claim ON public.contest_memberships(contest_id,player_id)
 WHERE status = 'approved' AND player_id IS NOT NULL;
CREATE TABLE public.contest_join_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contest_id uuid NOT NULL REFERENCES public.contests ON DELETE CASCADE,
 requester uuid NOT NULL REFERENCES auth.users, requested_name text NOT NULL CHECK (length(requested_name) BETWEEN 1 AND 80),
 desired_player_id uuid REFERENCES public.contest_players,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
 decided_by uuid REFERENCES auth.users, decided_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX contest_join_requests_pending ON public.contest_join_requests(contest_id,requester) WHERE status='pending';
CREATE TABLE public.operation_receipts (
 actor uuid NOT NULL REFERENCES auth.users, op_id uuid NOT NULL, request_hash text NOT NULL,
 contest_id uuid NOT NULL REFERENCES public.contests ON DELETE CASCADE, result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(actor,op_id)
);
ALTER TABLE public.contest_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contest_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE public.contest_join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contest_join_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE public.operation_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operation_receipts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.contest_memberships, public.contest_join_requests, public.operation_receipts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.contest_memberships, public.contest_join_requests, public.operation_receipts TO service_role;
-- Preserve complete old-row payloads for realtime UPDATE/DELETE consumers.
ALTER TABLE public.score_events REPLICA IDENTITY FULL;
ALTER TABLE public.score_events ADD COLUMN round_id uuid,
 ADD COLUMN cell_version bigint CHECK (cell_version > 0), ADD COLUMN contest_revision bigint CHECK (contest_revision > 0),
 ADD COLUMN actor uuid REFERENCES auth.users, ADD COLUMN op_id uuid, ADD COLUMN request_hash text,
 ADD COLUMN action text NOT NULL DEFAULT 'set';
ALTER TABLE public.score_events DROP CONSTRAINT score_events_strokes_check;
ALTER TABLE public.score_events ALTER COLUMN strokes DROP NOT NULL;
ALTER TABLE public.score_events ADD CONSTRAINT score_events_strokes_check CHECK
 ((action='set' AND strokes IS NOT NULL AND strokes BETWEEN 1 AND 15) OR (action='clear' AND strokes IS NULL));
CREATE UNIQUE INDEX score_events_revision ON public.score_events(contest_id,contest_revision);
CREATE UNIQUE INDEX score_events_cell_version ON public.score_events(contest_id,round_id,player_id,hole,cell_version) NULLS NOT DISTINCT WHERE cell_version IS NOT NULL;

-- Default allocation reserves the candidate against concurrent allocators with an
-- xact advisory lock. The existing invite_code UNIQUE constraint remains authoritative.
CREATE FUNCTION public.join_code_candidate() RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE candidate text := ''; bytes bytea := extensions.gen_random_bytes(6); i integer;
BEGIN
 FOR i IN 0..5 LOOP
  candidate := candidate || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',get_byte(bytes,i)%32+1,1);
 END LOOP;
 RETURN candidate;
END $$;
CREATE FUNCTION public.allocate_join_code() RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE candidate text; attempt integer;
BEGIN
 FOR attempt IN 1..32 LOOP
  candidate := public.join_code_candidate();
  PERFORM pg_advisory_xact_lock(hashtextextended('snapscore-code:'||candidate,0));
  IF NOT EXISTS (SELECT 1 FROM public.contests WHERE invite_code=candidate) THEN RETURN candidate; END IF;
 END LOOP;
 RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='CODE_EXHAUSTED';
END $$;
ALTER TABLE public.contests ALTER COLUMN invite_code SET DEFAULT public.allocate_join_code();

CREATE FUNCTION public.request_join(code text, display_name text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
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
CREATE FUNCTION public.list_join_requests(contest_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.contests c WHERE c.id=$1 AND c.owner_id=auth.uid())
 OR auth.uid() IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN
  RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='HOST_REQUIRED'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.created_at),'[]'::jsonb) FROM public.contest_join_requests r WHERE r.contest_id=$1);
END $$;
CREATE FUNCTION public.decide_join_request(request_id uuid, approve boolean, player_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
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
CREATE FUNCTION public.my_membership(contest_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='AUTH_REQUIRED'; END IF;
 RETURN (SELECT jsonb_build_object('role',m.role,'status',m.status,'player_id',m.player_id)
 FROM public.contest_memberships m WHERE m.contest_id=$1 AND m.user_id=auth.uid());
END $$;

CREATE FUNCTION public.write_score(contest_id uuid, round_id uuid, player_id uuid, hole integer, action text, strokes integer,
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

-- Protocol-1 legacy reads/mutations must not expose raw rows or bypass RPC CAS.
CREATE OR REPLACE FUNCTION public.is_contest_member(p_contest uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM public.contests c WHERE c.id=p_contest AND c.protocol=0 AND
 (c.owner_id=auth.uid() OR EXISTS(SELECT 1 FROM public.contest_players p WHERE p.contest_id=c.id AND p.user_id=auth.uid())));
$$;
-- Restrictive policies AND with all legacy permissive policies.
CREATE POLICY m2_legacy_contests ON public.contests AS RESTRICTIVE FOR ALL TO authenticated USING(protocol=0) WITH CHECK(protocol=0 AND NOT sync_enabled AND sync_revision=0);
-- A definer predicate avoids recursive contests policy lookup.
CREATE FUNCTION public.legacy_contest_open(cid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM public.contests WHERE id=cid AND protocol=0);
$$;
CREATE POLICY m2_legacy_players ON public.contest_players AS RESTRICTIVE FOR ALL TO authenticated USING(public.legacy_contest_open(contest_id)) WITH CHECK(public.legacy_contest_open(contest_id));
CREATE POLICY m2_legacy_scores ON public.score_events AS RESTRICTIVE FOR ALL TO authenticated USING(public.legacy_contest_open(contest_id)) WITH CHECK(public.legacy_contest_open(contest_id) AND cell_version IS NULL AND contest_revision IS NULL AND round_id IS NULL AND action='set' AND actor IS NULL AND op_id IS NULL AND request_hash IS NULL);
-- Block structural legacy SD publish updates under the same contest lock.
CREATE FUNCTION public.guard_sync_legacy() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE cid uuid; p smallint;
BEGIN
 cid := CASE WHEN TG_OP='DELETE' THEN OLD.contest_id ELSE NEW.contest_id END;
 SELECT protocol INTO p FROM public.contests WHERE id=cid FOR UPDATE;
 IF p=1 THEN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='LEGACY_PROTOCOL'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER m2_publish_guard BEFORE INSERT OR UPDATE OR DELETE ON public.published_rounds FOR EACH ROW EXECUTE FUNCTION public.guard_sync_legacy();
-- Do not grant allocator/trigger helpers to clients; legacy predicate is policy-only.
REVOKE ALL ON FUNCTION public.join_code_candidate(),public.allocate_join_code(), public.guard_sync_legacy(), public.legacy_contest_open(uuid),
 public.request_join(text,text), public.list_join_requests(uuid), public.decide_join_request(uuid,boolean,uuid), public.my_membership(uuid),
 public.write_score(uuid,uuid,uuid,integer,text,integer,bigint,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.legacy_contest_open(uuid),public.request_join(text,text),public.list_join_requests(uuid),
 public.decide_join_request(uuid,boolean,uuid),public.my_membership(uuid),public.write_score(uuid,uuid,uuid,integer,text,integer,bigint,uuid,text) TO authenticated;

-- No shipped client uses DDL privileges; TRUNCATE bypasses RLS.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.contests,public.contest_players,public.score_events FROM anon,authenticated;
REVOKE UPDATE, DELETE ON public.score_events FROM anon,authenticated;
