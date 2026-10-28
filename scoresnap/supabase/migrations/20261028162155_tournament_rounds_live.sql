-- Rewritten 008 (M3): tournament rounds on the live schema.
-- Live has score_events and contest_players.scores. It does not have contest_groups or hole_scores.
-- This migration creates those round objects; it does not ALTER the absent tables.
-- Idempotent: re-running on an already migrated database is a no-op.
-- Rollback: rollback/20261028162155_tournament_rounds_live.down.sql
--
-- Creates:
--   contest_rounds, contest_groups, round_player_assignments,
--   round_scorer_scopes, group_submissions, sync_id_map
--   ensure_default_round(), m3_score_insert_allowed(), sync_round_bundle(),
--   set_tournament_meta(), tournament_snapshot(), trigger m3_default_round,
--   policy m3_score_player_scope
-- Alters:
--   contests (is_tournament, current_round)
--   contest_players (status, course_handicaps, sort_order, id+contest unique)
--   score_events.round_id (composite FK to contest_rounds; column itself is M2)
--   write_score body (same argument list; NULL round_id resolves to round 1)
-- Does not create hole_scores. score_events stays the append-only log.

CREATE TABLE IF NOT EXISTS public.contest_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id uuid NOT NULL REFERENCES public.contests(id) ON DELETE CASCADE,
  round_number integer NOT NULL CHECK (round_number BETWEEN 1 AND 50),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  date date,
  course_name text,
  course_data jsonb,
  assignment_revision bigint NOT NULL DEFAULT 0 CHECK (assignment_revision >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contest_id, round_number),
  UNIQUE (id, contest_id)
);

CREATE TABLE IF NOT EXISTS public.contest_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id uuid NOT NULL,
  round_id uuid NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  tee_time text,
  external_id text,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, contest_id, round_id),
  FOREIGN KEY (round_id, contest_id) REFERENCES public.contest_rounds(id, contest_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS contest_players_id_contest ON public.contest_players (id, contest_id);

CREATE TABLE IF NOT EXISTS public.round_player_assignments (
  contest_id uuid NOT NULL,
  round_id uuid NOT NULL,
  player_id uuid NOT NULL,
  group_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contest_id, round_id, player_id),
  FOREIGN KEY (round_id, contest_id) REFERENCES public.contest_rounds(id, contest_id) ON DELETE CASCADE,
  FOREIGN KEY (player_id, contest_id) REFERENCES public.contest_players(id, contest_id) ON DELETE CASCADE,
  FOREIGN KEY (group_id, contest_id, round_id) REFERENCES public.contest_groups(id, contest_id, round_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.round_scorer_scopes (
  contest_id uuid NOT NULL,
  round_id uuid NOT NULL,
  group_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contest_id, round_id, group_id, user_id),
  FOREIGN KEY (group_id, contest_id, round_id) REFERENCES public.contest_groups(id, contest_id, round_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.group_submissions (
  contest_id uuid NOT NULL,
  round_id uuid NOT NULL,
  group_id uuid NOT NULL,
  score_revision bigint NOT NULL CHECK (score_revision >= 0),
  assignment_revision bigint NOT NULL CHECK (assignment_revision >= 0),
  submitted_by uuid NOT NULL REFERENCES auth.users(id),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contest_id, round_id, group_id),
  FOREIGN KEY (group_id, contest_id, round_id) REFERENCES public.contest_groups(id, contest_id, round_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.sync_id_map (
  contest_id uuid NOT NULL REFERENCES public.contests(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('round', 'group', 'player')),
  local_id text NOT NULL CHECK (length(local_id) BETWEEN 1 AND 80),
  server_id uuid NOT NULL,
  PRIMARY KEY (contest_id, kind, local_id)
);

ALTER TABLE public.contests ADD COLUMN IF NOT EXISTS is_tournament boolean NOT NULL DEFAULT false;
ALTER TABLE public.contests ADD COLUMN IF NOT EXISTS current_round integer NOT NULL DEFAULT 1;
ALTER TABLE public.contest_players ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE public.contest_players ADD COLUMN IF NOT EXISTS course_handicaps jsonb;
ALTER TABLE public.contest_players ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contests_current_round_check') THEN
    ALTER TABLE public.contests ADD CONSTRAINT contests_current_round_check CHECK (current_round BETWEEN 1 AND 50);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contest_players_status_check') THEN
    ALTER TABLE public.contest_players ADD CONSTRAINT contest_players_status_check CHECK (status IN ('active', 'WD', 'NS'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contest_players_sort_order_check') THEN
    ALTER TABLE public.contest_players ADD CONSTRAINT contest_players_sort_order_check CHECK (sort_order >= 0);
  END IF;
END $$;

INSERT INTO public.contest_rounds (contest_id, round_number, name)
SELECT c.id, 1, 'Round 1' FROM public.contests c
WHERE NOT EXISTS (SELECT 1 FROM public.contest_rounds r WHERE r.contest_id = c.id);

UPDATE public.score_events e
SET round_id = r.id
FROM public.contest_rounds r
WHERE e.contest_id = r.contest_id
  AND r.round_number = 1
  AND e.round_id IS NULL
  AND (SELECT count(*) FROM public.contest_rounds r2 WHERE r2.contest_id = e.contest_id) = 1;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'score_events_round_fk') THEN
    ALTER TABLE public.score_events
      ADD CONSTRAINT score_events_round_fk
      FOREIGN KEY (round_id, contest_id) REFERENCES public.contest_rounds(id, contest_id) ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE public.contest_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contest_rounds FORCE ROW LEVEL SECURITY;
ALTER TABLE public.contest_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contest_groups FORCE ROW LEVEL SECURITY;
ALTER TABLE public.round_player_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_player_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.round_scorer_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_scorer_scopes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.group_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_submissions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sync_id_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_id_map FORCE ROW LEVEL SECURITY;
ALTER TABLE public.contests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contest_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.score_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.contest_rounds, public.contest_groups, public.round_player_assignments,
  public.round_scorer_scopes, public.group_submissions, public.sync_id_map
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.contest_rounds, public.contest_groups, public.round_player_assignments,
  public.round_scorer_scopes, public.group_submissions, public.sync_id_map TO service_role;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.contest_rounds, public.contest_groups,
  public.round_player_assignments, public.round_scorer_scopes, public.group_submissions, public.sync_id_map
  FROM anon, authenticated;

-- Direct score inserts still have the legacy member policy. This restrictive policy
-- stops a member from writing a different player's score. Hosts and assigned scorers remain allowed.
-- The check is SECURITY DEFINER because those tables are revoked from authenticated;
-- a policy subquery would otherwise fail the writer's own insert.
CREATE OR REPLACE FUNCTION public.m3_score_insert_allowed(contest uuid, player uuid, round uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT public.is_contest_owner(contest)
    OR EXISTS (
      SELECT 1 FROM public.contest_players p
      WHERE p.id = player AND p.contest_id = contest AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.round_player_assignments a
      JOIN public.round_scorer_scopes s
        ON s.contest_id = a.contest_id AND s.round_id = a.round_id AND s.group_id = a.group_id
       AND s.user_id = auth.uid() AND s.status = 'approved'
      WHERE a.contest_id = contest AND a.player_id = player AND a.round_id IS NOT DISTINCT FROM round
    );
$$;
REVOKE ALL ON FUNCTION public.m3_score_insert_allowed(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.m3_score_insert_allowed(uuid, uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS m3_score_player_scope ON public.score_events;
CREATE POLICY m3_score_player_scope ON public.score_events
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.m3_score_insert_allowed(contest_id, player_id, round_id));

CREATE OR REPLACE FUNCTION public.ensure_default_round() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  INSERT INTO public.contest_rounds (contest_id, round_number, name)
  VALUES (NEW.id, 1, 'Round 1')
  ON CONFLICT (contest_id, round_number) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS m3_default_round ON public.contests;
CREATE TRIGGER m3_default_round AFTER INSERT ON public.contests
  FOR EACH ROW EXECUTE FUNCTION public.ensure_default_round();

CREATE OR REPLACE FUNCTION public.sync_round_bundle(contest_id uuid, payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  c public.contests; uid uuid := auth.uid(); rid uuid; n integer; local text;
  g jsonb; elem jsonb; gid uuid; pid uuid; glocal text; plocal text;
  gname text; pname text; tval text; st text; hcap numeric; sorder integer; gorder integer;
  keep uuid[] := ARRAY[]::uuid[]; seen uuid[] := ARRAY[]::uuid[];
  players jsonb; groups jsonb := '[]'::jsonb; d date; cdata jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='AUTH_REQUIRED'; END IF;
  IF coalesce((auth.jwt()->>'is_anonymous')::boolean, false) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='HOST_REQUIRED'; END IF;
  IF contest_id IS NULL OR payload IS NULL OR jsonb_typeof(payload) <> 'object' OR length(payload::text) > 200000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_REQUEST'; END IF;
  IF payload ? 'groups' AND jsonb_typeof(payload->'groups') <> 'array' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_REQUEST'; END IF;
  SELECT * INTO c FROM public.contests WHERE id = contest_id FOR UPDATE;
  IF c.id IS NULL OR c.owner_id <> uid THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='HOST_REQUIRED'; END IF;
  IF NOT c.sync_enabled OR c.protocol <> 1 OR c.status <> 'active' THEN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='SYNC_PAUSED'; END IF;
  BEGIN
    n := CASE WHEN payload ? 'number' AND nullif(payload->>'number','') IS NOT NULL THEN (payload->>'number')::integer ELSE NULL END;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_REQUEST';
  END;
  IF n IS NOT NULL AND n NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_REQUEST'; END IF;
  local := nullif(btrim(payload->>'local_id'), '');
  IF local IS NOT NULL THEN
    IF length(local) > 80 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_REQUEST'; END IF;
    SELECT m.server_id INTO rid FROM public.sync_id_map m WHERE m.contest_id = c.id AND m.kind = 'round' AND m.local_id = local;
  END IF;
  IF rid IS NULL AND payload->>'server_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    rid := (payload->>'server_id')::uuid;
    IF NOT EXISTS (SELECT 1 FROM public.contest_rounds r WHERE r.id = rid AND r.contest_id = c.id) THEN rid := NULL; END IF;
  END IF;
  IF n IS NOT NULL THEN
    SELECT r.id INTO rid FROM public.contest_rounds r WHERE r.contest_id = c.id AND r.round_number = n;
  END IF;
  IF rid IS NULL AND n IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='ROUND_NOT_READY'; END IF;
  BEGIN
    d := nullif(payload->>'date', '')::date;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_REQUEST';
  END;
  IF payload ? 'course_data' AND payload->'course_data' IS NOT NULL AND jsonb_typeof(payload->'course_data') NOT IN ('object', 'null') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_REQUEST'; END IF;
  cdata := CASE WHEN payload->'course_data' IS NULL OR jsonb_typeof(payload->'course_data') = 'null' THEN NULL ELSE payload->'course_data' END;
  IF rid IS NULL THEN
    IF payload ? 'name' AND (payload->>'name' IS NULL OR length(btrim(payload->>'name')) NOT BETWEEN 1 AND 80) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_REQUEST'; END IF;
    INSERT INTO public.contest_rounds (contest_id, round_number, name, date, course_name, course_data)
    VALUES (c.id, n, coalesce(nullif(btrim(payload->>'name'), ''), 'Round ' || n), d, nullif(btrim(payload->>'course_name'), ''), cdata)
    RETURNING id INTO rid;
  ELSE
    UPDATE public.contest_rounds r SET
      name = CASE WHEN payload ? 'name' AND length(btrim(payload->>'name')) BETWEEN 1 AND 80 THEN btrim(payload->>'name') ELSE r.name END,
      date = CASE WHEN payload ? 'date' THEN d ELSE r.date END,
      course_name = CASE WHEN payload ? 'course_name' THEN nullif(btrim(payload->>'course_name'), '') ELSE r.course_name END,
      course_data = CASE WHEN payload ? 'course_data' THEN cdata ELSE r.course_data END
    WHERE r.id = rid AND r.contest_id = c.id;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='ROUND_NOT_READY'; END IF;
  END IF;
  IF local IS NOT NULL THEN
    INSERT INTO public.sync_id_map (contest_id, kind, local_id, server_id) VALUES (c.id, 'round', local, rid)
    ON CONFLICT ON CONSTRAINT sync_id_map_pkey DO UPDATE SET server_id = excluded.server_id;
  END IF;
  IF payload ? 'groups' THEN
    DELETE FROM public.round_player_assignments a WHERE a.contest_id = c.id AND a.round_id = rid;
    FOR g IN SELECT value FROM jsonb_array_elements(payload->'groups') LOOP
      IF jsonb_typeof(g) <> 'object' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_REQUEST'; END IF;
      gname := btrim(g->>'name');
      IF gname IS NULL OR length(gname) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_REQUEST'; END IF;
      IF g ? 'tee_time' AND g->>'tee_time' IS NOT NULL AND length(g->>'tee_time') > 40 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_REQUEST'; END IF;
      IF g ? 'external_id' AND g->>'external_id' IS NOT NULL AND length(g->>'external_id') > 80 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_REQUEST'; END IF;
      BEGIN
        gorder := coalesce((nullif(g->>'sort_order', ''))::integer, 0);
      EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_REQUEST';
      END;
      IF gorder < 0 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_REQUEST'; END IF;
      gid := NULL; glocal := nullif(btrim(g->>'local_id'), '');
      IF glocal IS NOT NULL THEN
        IF length(glocal) > 80 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_REQUEST'; END IF;
        SELECT m.server_id INTO gid FROM public.sync_id_map m WHERE m.contest_id = c.id AND m.kind = 'group' AND m.local_id = glocal;
      END IF;
      IF gid IS NULL AND g->>'server_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN gid := (g->>'server_id')::uuid; END IF;
      IF gid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.contest_groups cg WHERE cg.id = gid AND cg.contest_id = c.id) THEN
        IF EXISTS (SELECT 1 FROM public.contest_groups cg WHERE cg.id = gid) THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_REQUEST'; END IF;
      END IF;
      IF gid IS NULL OR NOT EXISTS (SELECT 1 FROM public.contest_groups cg WHERE cg.id = gid AND cg.contest_id = c.id) THEN
        INSERT INTO public.contest_groups (id, contest_id, round_id, name, tee_time, external_id, sort_order)
        VALUES (coalesce(gid, gen_random_uuid()), c.id, rid, gname, nullif(g->>'tee_time', ''), nullif(g->>'external_id', ''), gorder)
        RETURNING id INTO gid;
      ELSE
        DELETE FROM public.round_player_assignments a WHERE a.contest_id = c.id AND a.group_id = gid;
        UPDATE public.contest_groups cg SET name = gname, tee_time = nullif(g->>'tee_time', ''), external_id = nullif(g->>'external_id', ''),
          sort_order = gorder, round_id = rid
        WHERE cg.id = gid AND cg.contest_id = c.id RETURNING cg.id INTO gid;
      END IF;
      IF glocal IS NOT NULL THEN
        INSERT INTO public.sync_id_map (contest_id, kind, local_id, server_id) VALUES (c.id, 'group', glocal, gid)
        ON CONFLICT ON CONSTRAINT sync_id_map_pkey DO UPDATE SET server_id = excluded.server_id;
      END IF;
      keep := keep || gid;
      players := '[]'::jsonb;
      FOR elem IN SELECT value FROM jsonb_array_elements(coalesce(g->'players', '[]'::jsonb)) LOOP
        IF jsonb_typeof(elem) <> 'object' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_REQUEST'; END IF;
        pname := btrim(elem->>'name');
        IF pname IS NULL OR length(pname) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_REQUEST'; END IF;
        st := coalesce(nullif(btrim(elem->>'status'), ''), 'active');
        IF st NOT IN ('active', 'WD', 'NS') THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_REQUEST'; END IF;
        BEGIN
          hcap := coalesce((nullif(elem->>'handicap', ''))::numeric, 0);
          sorder := coalesce((nullif(elem->>'sort_order', ''))::integer, 0);
        EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
          RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_REQUEST';
        END;
        IF sorder < 0 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_REQUEST'; END IF;
        IF elem ? 'course_handicaps' AND elem->'course_handicaps' IS NOT NULL AND jsonb_typeof(elem->'course_handicaps') NOT IN ('object', 'null') THEN
          RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_REQUEST'; END IF;
        tval := nullif(btrim(elem->>'team'), '');
        IF tval IS NOT NULL AND tval NOT IN ('A', 'B') THEN tval := NULL; END IF;
        pid := NULL; plocal := nullif(btrim(elem->>'local_id'), '');
        IF plocal IS NOT NULL THEN
          IF length(plocal) > 80 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_REQUEST'; END IF;
          SELECT m.server_id INTO pid FROM public.sync_id_map m WHERE m.contest_id = c.id AND m.kind = 'player' AND m.local_id = plocal;
        END IF;
        IF pid IS NULL AND elem->>'server_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN pid := (elem->>'server_id')::uuid; END IF;
        IF pid IS NULL THEN pid := gen_random_uuid(); END IF;
        IF pid = ANY(seen) THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_REQUEST'; END IF;
        seen := seen || pid;
        IF EXISTS (SELECT 1 FROM public.contest_players cp WHERE cp.id = pid AND cp.contest_id <> c.id) THEN
          RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_PLAYER'; END IF;
        INSERT INTO public.contest_players (id, contest_id, name, handicap, team, sort_order, status, course_handicaps)
        VALUES (pid, c.id, pname, hcap, tval, sorder, st,
          CASE WHEN elem->'course_handicaps' IS NULL OR jsonb_typeof(elem->'course_handicaps') = 'null' THEN NULL ELSE elem->'course_handicaps' END)
        ON CONFLICT (id) DO UPDATE SET
          name = excluded.name, handicap = excluded.handicap,
          team = CASE WHEN excluded.team IN ('A', 'B') THEN excluded.team ELSE public.contest_players.team END,
          sort_order = excluded.sort_order, status = excluded.status, course_handicaps = excluded.course_handicaps
        WHERE public.contest_players.contest_id = excluded.contest_id;
        IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_PLAYER'; END IF;
        IF plocal IS NOT NULL THEN
          INSERT INTO public.sync_id_map (contest_id, kind, local_id, server_id) VALUES (c.id, 'player', plocal, pid)
          ON CONFLICT ON CONSTRAINT sync_id_map_pkey DO UPDATE SET server_id = excluded.server_id;
        END IF;
        players := players || jsonb_build_array(jsonb_build_object('local_id', plocal, 'id', pid));
      END LOOP;
      groups := groups || jsonb_build_array(jsonb_build_object('local_id', glocal, 'id', gid, 'players', players));
    END LOOP;
    DELETE FROM public.contest_groups cg WHERE cg.contest_id = c.id AND cg.round_id = rid AND NOT (cg.id = ANY(keep));
    FOR g IN SELECT value FROM jsonb_array_elements(groups) LOOP
      gid := (g->>'id')::uuid;
      FOR elem IN SELECT value FROM jsonb_array_elements(g->'players') LOOP
        INSERT INTO public.round_player_assignments (contest_id, round_id, player_id, group_id)
        VALUES (c.id, rid, (elem->>'id')::uuid, gid);
      END LOOP;
    END LOOP;
    DELETE FROM public.group_submissions s WHERE s.contest_id = c.id AND s.round_id = rid;
    UPDATE public.contest_rounds r SET assignment_revision = r.assignment_revision + 1 WHERE r.id = rid;
  END IF;
  RETURN jsonb_build_object('round_id', rid, 'groups', groups);
END $$;

CREATE OR REPLACE FUNCTION public.set_tournament_meta(contest_id uuid, is_tournament boolean, current_round integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c public.contests; uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='AUTH_REQUIRED'; END IF;
  IF coalesce((auth.jwt()->>'is_anonymous')::boolean, false) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='HOST_REQUIRED'; END IF;
  SELECT * INTO c FROM public.contests WHERE id = contest_id FOR UPDATE;
  IF c.id IS NULL OR c.owner_id <> uid THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='HOST_REQUIRED'; END IF;
  IF NOT c.sync_enabled OR c.protocol <> 1 OR c.status <> 'active' THEN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='SYNC_PAUSED'; END IF;
  IF is_tournament IS NULL OR current_round IS NULL OR current_round NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_REQUEST'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.contest_rounds r WHERE r.contest_id = c.id AND r.round_number = current_round) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='ROUND_NOT_READY'; END IF;
  UPDATE public.contests SET is_tournament = set_tournament_meta.is_tournament, current_round = set_tournament_meta.current_round WHERE id = c.id;
  RETURN jsonb_build_object('status', 'ok', 'is_tournament', is_tournament, 'current_round', current_round);
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

-- NULL round_id means round 1. A provided round must belong to the contest.
-- Host (non-anonymous) writes any player. An approved player writes only that slot.
-- An assigned scorer writes players in the scoped group. Watchers and other guests do not.
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

REVOKE ALL ON FUNCTION public.ensure_default_round(), public.sync_round_bundle(uuid, jsonb),
  public.set_tournament_meta(uuid, boolean, integer), public.tournament_snapshot(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_round_bundle(uuid, jsonb), public.set_tournament_meta(uuid, boolean, integer),
  public.tournament_snapshot(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ensure_default_round() TO service_role;
