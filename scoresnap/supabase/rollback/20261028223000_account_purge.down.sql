-- Restore the M3 sync_round_bundle and drop the purge helpers.
-- Run this before the M3 down script. M3 objects must still exist.

DROP FUNCTION IF EXISTS public.purge_account(uuid);
DROP FUNCTION IF EXISTS public.purge_scrub_json(jsonb, text, uuid);
DROP FUNCTION IF EXISTS public.purge_replace_referral(text, text);
DROP FUNCTION IF EXISTS public.purge_scrub_email(text, text);
DROP FUNCTION IF EXISTS public.purge_rewrite_names(jsonb, text[]);
DROP FUNCTION IF EXISTS public.purge_published_name(text);

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
