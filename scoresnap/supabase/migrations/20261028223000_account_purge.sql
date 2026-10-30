-- Account purge in one transaction, plus the host stamp on sync_round_bundle.
-- Not in the live ledger. Do not apply this to the hosted database from CI.
-- Rollback: supabase/rollback/20261028223000_account_purge.down.sql

CREATE FUNCTION public.purge_published_name(p_name text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $fn$
  SELECT left(btrim(coalesce(p_name, '')), 80);
$fn$;

CREATE FUNCTION public.purge_rewrite_names(p_node jsonb, p_names text[]) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $fn$
DECLARE
  targets text[];
  key text;
  val jsonb;
  out jsonb;
  elem jsonb;
BEGIN
  SELECT coalesce(array_agg(DISTINCT public.purge_published_name(n)), ARRAY[]::text[])
    INTO targets
  FROM unnest(coalesce(p_names, ARRAY[]::text[])) AS n
  WHERE public.purge_published_name(n) <> ''
    AND public.purge_published_name(n) <> 'Deleted player';
  IF p_node IS NULL OR targets IS NULL OR cardinality(targets) = 0 THEN
    RETURN p_node;
  END IF;
  IF jsonb_typeof(p_node) = 'array' THEN
    out := '[]'::jsonb;
    FOR elem IN SELECT value FROM jsonb_array_elements(p_node) LOOP
      out := out || jsonb_build_array(public.purge_rewrite_names(elem, p_names));
    END LOOP;
    RETURN out;
  END IF;
  IF jsonb_typeof(p_node) = 'object' THEN
    out := '{}'::jsonb;
    FOR key, val IN SELECT * FROM jsonb_each(p_node) LOOP
      IF key = 'displayName' AND jsonb_typeof(val) = 'string' AND public.purge_published_name(val #>> '{}') = ANY(targets) THEN
        out := out || jsonb_build_object(key, 'Deleted player');
      ELSE
        out := out || jsonb_build_object(key, public.purge_rewrite_names(val, p_names));
      END IF;
    END LOOP;
    RETURN out;
  END IF;
  RETURN p_node;
END
$fn$;

CREATE FUNCTION public.purge_scrub_email(p_text text, p_email text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $fn$
DECLARE
  src text := p_text;
  needle text;
  from_pos int := 1;
  found int;
  prev text;
  nxt text;
  out text := '';
BEGIN
  IF src IS NULL OR p_email IS NULL OR p_email = '' THEN
    RETURN src;
  END IF;
  needle := lower(p_email);
  WHILE from_pos <= char_length(src) LOOP
    found := position(needle IN lower(substr(src, from_pos)));
    IF found = 0 THEN
      out := out || substr(src, from_pos);
      EXIT;
    END IF;
    found := from_pos + found - 1;
    prev := CASE WHEN found = 1 THEN '' ELSE substr(src, found - 1, 1) END;
    nxt := substr(src, found + char_length(p_email), 1);
    IF (prev = '' OR prev !~* '[A-Z0-9._%+-]') AND (nxt = '' OR nxt !~* '[A-Z0-9._%+-]') THEN
      out := out || substr(src, from_pos, found - from_pos) || '[deleted]';
      from_pos := found + char_length(p_email);
    ELSE
      out := out || substr(src, from_pos, found - from_pos + 1);
      from_pos := found + 1;
    END IF;
  END LOOP;
  RETURN out;
END
$fn$;

-- Replace a Referral: or Code: value only when the whole token equals this code.
CREATE FUNCTION public.purge_replace_referral(p_text text, p_code text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $fn$
DECLARE
  src text := p_text;
  i int := 1;
  n int;
  start_at int;
  label text;
  token text;
  cleaned text;
  ch text;
  out text := '';
BEGIN
  IF src IS NULL OR p_code IS NULL OR p_code = '' THEN
    RETURN src;
  END IF;
  n := char_length(src);
  WHILE i <= n LOOP
    IF substr(src, i, 9) = 'Referral:' THEN
      label := 'Referral';
      start_at := i;
      i := i + 9;
    ELSIF substr(src, i, 5) = 'Code:' THEN
      label := 'Code';
      start_at := i;
      i := i + 5;
    ELSE
      out := out || substr(src, i, 1);
      i := i + 1;
      CONTINUE;
    END IF;
    WHILE i <= n AND substr(src, i, 1) IN (' ', E'\t') LOOP
      i := i + 1;
    END LOOP;
    token := '';
    WHILE i <= n LOOP
      ch := substr(src, i, 1);
      EXIT WHEN ch ~ '\s' OR ch = '|';
      token := token || ch;
      i := i + 1;
    END LOOP;
    cleaned := regexp_replace(token, '[,;]+$', '');
    IF token <> '' AND cleaned = p_code THEN
      out := out || label || ': [deleted]' || substr(token, char_length(cleaned) + 1);
    ELSE
      out := out || substr(src, start_at, i - start_at);
    END IF;
  END LOOP;
  RETURN out;
END
$fn$;

CREATE FUNCTION public.purge_scrub_json(p_node jsonb, p_email text, p_user uuid) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $fn$
DECLARE
  key text;
  val jsonb;
  out jsonb;
  elem jsonb;
  user_text text := p_user::text;
BEGIN
  IF p_node IS NULL THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(p_node) = 'array' THEN
    out := '[]'::jsonb;
    FOR elem IN SELECT value FROM jsonb_array_elements(p_node) LOOP
      out := out || jsonb_build_array(public.purge_scrub_json(elem, p_email, p_user));
    END LOOP;
    RETURN out;
  END IF;
  IF jsonb_typeof(p_node) = 'object' THEN
    out := '{}'::jsonb;
    FOR key, val IN SELECT * FROM jsonb_each(p_node) LOOP
      IF p_user IS NOT NULL AND key IN ('referrer_id', 'user_id') AND jsonb_typeof(val) = 'string' AND val #>> '{}' = user_text THEN
        out := out || jsonb_build_object(key, 'null'::jsonb);
      ELSIF jsonb_typeof(val) = 'string' THEN
        out := out || jsonb_build_object(key, to_jsonb(public.purge_scrub_email(val #>> '{}', p_email)));
      ELSE
        out := out || jsonb_build_object(key, public.purge_scrub_json(val, p_email, p_user));
      END IF;
    END LOOP;
    RETURN out;
  END IF;
  IF jsonb_typeof(p_node) = 'string' THEN
    RETURN to_jsonb(public.purge_scrub_email(p_node #>> '{}', p_email));
  END IF;
  RETURN p_node;
END
$fn$;

-- One transaction for the caller's rows. The Auth admin delete stays outside SQL.
CREATE FUNCTION public.purge_account(p_user_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE
  v_email text;
  v_code text;
  cid uuid;
  v_owner uuid;
  v_successor uuid;
  v_entered uuid;
  roster uuid[];
  names text[];
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_REQUEST';
  END IF;
  SELECT email, referral_code INTO v_email, v_code
  FROM public.profiles
  WHERE id = p_user_id;
  IF v_code = '' THEN
    v_code := NULL;
  END IF;
  FOR cid IN
    SELECT DISTINCT id FROM (
      SELECT id FROM public.contests WHERE owner_id = p_user_id
      UNION
      SELECT contest_id FROM public.contest_players WHERE user_id = p_user_id
      UNION
      SELECT contest_id FROM public.contest_memberships WHERE user_id = p_user_id
      UNION
      SELECT contest_id FROM public.score_events WHERE entered_by = p_user_id OR actor = p_user_id
      UNION
      SELECT contest_id FROM public.published_rounds WHERE owner_id = p_user_id
      UNION
      SELECT contest_id FROM public.round_scorer_scopes WHERE user_id = p_user_id
      UNION
      SELECT contest_id FROM public.group_submissions WHERE submitted_by = p_user_id
    ) involved
  LOOP
    v_owner := NULL;
    v_successor := NULL;
    SELECT owner_id INTO v_owner FROM public.contests WHERE id = cid;
    IF v_owner IS NULL THEN
      CONTINUE;
    END IF;
    SELECT uid INTO v_successor FROM (
      SELECT m.user_id AS uid
      FROM public.contest_memberships m
      WHERE m.contest_id = cid AND m.user_id <> p_user_id
      UNION
      SELECT p.user_id
      FROM public.contest_players p
      WHERE p.contest_id = cid AND p.user_id IS NOT NULL AND p.user_id <> p_user_id
    ) others
    ORDER BY uid::text
    LIMIT 1;
    IF v_owner = p_user_id AND v_successor IS NULL THEN
      DELETE FROM public.score_events WHERE contest_id = cid;
      DELETE FROM public.contests WHERE id = cid;
      CONTINUE;
    END IF;
    IF v_owner = p_user_id THEN
      UPDATE public.contests SET owner_id = v_successor WHERE id = cid;
      UPDATE public.published_rounds SET owner_id = v_successor WHERE contest_id = cid AND owner_id = p_user_id;
      v_entered := v_successor;
    ELSE
      UPDATE public.published_rounds SET owner_id = v_owner WHERE contest_id = cid AND owner_id = p_user_id;
      v_entered := v_owner;
    END IF;
    SELECT coalesce(array_agg(DISTINCT p.id), ARRAY[]::uuid[]) INTO roster
    FROM public.contest_players p
    WHERE p.contest_id = cid
      AND (
        p.user_id = p_user_id
        OR EXISTS (
          SELECT 1 FROM public.contest_memberships m
          WHERE m.contest_id = p.contest_id
            AND m.user_id = p_user_id
            AND m.player_id = p.id
            AND (p.user_id = p_user_id OR p.user_id IS NULL)
        )
      );
    SELECT coalesce(array_agg(p.name), ARRAY[]::text[]) INTO names
    FROM public.contest_players p
    WHERE p.id = ANY(roster);
    UPDATE public.published_rounds
    SET snapshot = public.purge_rewrite_names(snapshot, names)
    WHERE contest_id = cid;
    UPDATE public.round_messages
    SET display_name = 'Deleted player'
    WHERE contest_id = cid
      AND public.purge_published_name(display_name) = ANY(
        SELECT public.purge_published_name(n)
        FROM unnest(names) AS n
        WHERE public.purge_published_name(n) <> ''
          AND public.purge_published_name(n) <> 'Deleted player'
      );
    UPDATE public.contest_players
    SET name = 'Deleted player', user_id = NULL
    WHERE id = ANY(roster);
    UPDATE public.score_events
    SET entered_by = v_entered
    WHERE contest_id = cid AND entered_by = p_user_id;
    UPDATE public.score_events
    SET actor = NULL
    WHERE contest_id = cid AND actor = p_user_id;
  END LOOP;
  DELETE FROM public.round_scorer_scopes WHERE user_id = p_user_id;
  UPDATE public.group_submissions
  SET submitted_by = public.contests.owner_id
  FROM public.contests
  WHERE public.group_submissions.contest_id = public.contests.id
    AND public.group_submissions.submitted_by = p_user_id
    AND public.contests.owner_id <> p_user_id;
  DELETE FROM public.contest_memberships WHERE user_id = p_user_id;
  DELETE FROM public.contest_join_requests WHERE requester = p_user_id;
  UPDATE public.contest_join_requests SET decided_by = NULL WHERE decided_by = p_user_id;
  DELETE FROM public.operation_receipts WHERE actor = p_user_id;
  UPDATE public.settlements
  SET scan_id = NULL
  WHERE scan_id IN (SELECT id FROM public.scans WHERE user_id = p_user_id);
  WITH touched AS (
    UPDATE public.settlements
    SET from_user_id = CASE WHEN from_user_id = p_user_id THEN NULL ELSE from_user_id END,
        to_user_id = CASE WHEN to_user_id = p_user_id THEN NULL ELSE to_user_id END
    WHERE from_user_id = p_user_id OR to_user_id = p_user_id
    RETURNING id, from_user_id, to_user_id
  )
  DELETE FROM public.settlements
  USING touched
  WHERE public.settlements.id = touched.id
    AND touched.from_user_id IS NULL
    AND touched.to_user_id IS NULL;
  DELETE FROM public.scans WHERE user_id = p_user_id;
  DELETE FROM public.marketing_events WHERE user_id = p_user_id;
  IF v_email IS NOT NULL THEN
    UPDATE public.marketing_events
    SET properties = public.purge_scrub_json(properties, v_email, p_user_id)
    WHERE properties IS NOT NULL
      AND public.purge_scrub_json(properties, v_email, p_user_id) IS DISTINCT FROM properties;
    DELETE FROM public.feedback
    WHERE user_id = p_user_id OR lower(user_email) = lower(v_email);
    UPDATE public.revenue_events
    SET customer_email = NULL,
        metadata = public.purge_scrub_json(coalesce(metadata, '{}'::jsonb), v_email, NULL)
    WHERE lower(customer_email) = lower(v_email);
    UPDATE public.automation_log
    SET title = public.purge_scrub_email(title, v_email),
        details = CASE WHEN details IS NULL THEN NULL ELSE public.purge_scrub_email(details, v_email) END
    WHERE position(lower(v_email) IN lower(title)) > 0
       OR position(lower(v_email) IN lower(coalesce(details, ''))) > 0;
  ELSE
    DELETE FROM public.feedback WHERE user_id = p_user_id;
  END IF;
  IF v_code IS NOT NULL THEN
    UPDATE public.profiles SET referred_by = NULL WHERE referred_by = v_code AND id <> p_user_id;
    UPDATE public.marketing_events SET campaign = NULL WHERE campaign = v_code;
    UPDATE public.marketing_events
    SET properties = properties
      || CASE WHEN properties->>'referred_by' = v_code THEN jsonb_build_object('referred_by', 'null'::jsonb) ELSE '{}'::jsonb END
      || CASE WHEN properties->>'referral_code' = v_code THEN jsonb_build_object('referral_code', 'null'::jsonb) ELSE '{}'::jsonb END
    WHERE properties->>'referred_by' = v_code OR properties->>'referral_code' = v_code;
    UPDATE public.automation_log
    SET title = public.purge_replace_referral(title, v_code),
        details = CASE WHEN details IS NULL THEN NULL ELSE public.purge_replace_referral(details, v_code) END
    WHERE public.purge_replace_referral(title, v_code) IS DISTINCT FROM title
       OR public.purge_replace_referral(details, v_code) IS DISTINCT FROM details;
  END IF;
  DELETE FROM public.profiles WHERE id = p_user_id;
END
$fn$;

CREATE OR REPLACE FUNCTION public.sync_round_bundle(contest_id uuid, payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  c public.contests; uid uuid := auth.uid(); rid uuid; n integer; local text;
  g jsonb; elem jsonb; gid uuid; pid uuid; glocal text; plocal text;
  gname text; pname text; tval text; st text; hcap numeric; sorder integer; gorder integer;
  keep uuid[] := ARRAY[]::uuid[]; seen uuid[] := ARRAY[]::uuid[];
  players jsonb; groups jsonb := '[]'::jsonb; d date; cdata jsonb;
  host_seen boolean := false;
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
    host_seen := false;
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
        IF lower(coalesce(elem->>'host', '')) IN ('true', 't') THEN
          IF host_seen THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_REQUEST'; END IF;
          host_seen := true;
        END IF;
        INSERT INTO public.contest_players (id, contest_id, name, handicap, team, sort_order, status, course_handicaps, user_id)
        VALUES (pid, c.id, pname, hcap, tval, sorder, st,
          CASE WHEN elem->'course_handicaps' IS NULL OR jsonb_typeof(elem->'course_handicaps') = 'null' THEN NULL ELSE elem->'course_handicaps' END,
          CASE WHEN lower(coalesce(elem->>'host', '')) IN ('true', 't') THEN uid ELSE NULL END)
        ON CONFLICT (id) DO UPDATE SET
          name = excluded.name, handicap = excluded.handicap,
          team = CASE WHEN excluded.team IN ('A', 'B') THEN excluded.team ELSE public.contest_players.team END,
          sort_order = excluded.sort_order, status = excluded.status, course_handicaps = excluded.course_handicaps,
          user_id = CASE
            WHEN lower(coalesce(elem->>'host', '')) IN ('true', 't')
              AND (public.contest_players.user_id IS NULL OR public.contest_players.user_id = uid)
            THEN uid
            ELSE public.contest_players.user_id
          END
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

REVOKE ALL ON FUNCTION
  public.purge_published_name(text),
  public.purge_rewrite_names(jsonb, text[]),
  public.purge_scrub_email(text, text),
  public.purge_scrub_json(jsonb, text, uuid),
  public.purge_replace_referral(text, text),
  public.purge_account(uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_account(uuid) TO service_role;
