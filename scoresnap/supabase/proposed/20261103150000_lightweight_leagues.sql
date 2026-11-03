-- M9 candidate only. Not part of the active migration chain and never applied
-- to a hosted project by this proposal. Apply only on a disposable local stack.
BEGIN;

CREATE TABLE public.leagues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.league_memberships (
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  league_player_id uuid NOT NULL DEFAULT gen_random_uuid(),
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 80),
  role text NOT NULL DEFAULT 'player' CHECK (role IN ('host','player')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (league_id,user_id),
  UNIQUE (league_id,league_player_id)
);

CREATE TABLE public.league_events (
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  contest_id uuid NOT NULL REFERENCES public.contests(id) ON DELETE CASCADE,
  linked_by uuid NOT NULL REFERENCES auth.users(id),
  linked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (league_id,contest_id),
  UNIQUE (contest_id)
);
ALTER TABLE public.contests ADD COLUMN league_id uuid REFERENCES public.leagues(id) ON DELETE SET NULL;

CREATE TABLE public.league_event_players (
  league_id uuid NOT NULL,
  contest_id uuid NOT NULL,
  league_player_id uuid NOT NULL,
  contest_player_id uuid NOT NULL REFERENCES public.contest_players(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (league_id,contest_id,league_player_id),
  UNIQUE (league_id,contest_id,contest_player_id),
  FOREIGN KEY (league_id,contest_id) REFERENCES public.league_events(league_id,contest_id) ON DELETE CASCADE,
  FOREIGN KEY (league_id,league_player_id) REFERENCES public.league_memberships(league_id,league_player_id) ON DELETE CASCADE
);

CREATE INDEX league_memberships_user_status ON public.league_memberships(user_id,status);
CREATE INDEX league_events_contest ON public.league_events(contest_id);

ALTER TABLE public.leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leagues FORCE ROW LEVEL SECURITY;
ALTER TABLE public.league_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE public.league_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.league_event_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_event_players FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.leagues,public.league_memberships,public.league_events,public.league_event_players FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.create_league(league_name text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE uid uuid := auth.uid(); lid uuid; display text;
BEGIN
  IF uid IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ACCOUNT_REQUIRED';
  END IF;
  IF league_name IS NULL OR length(btrim(league_name)) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='INVALID_LEAGUE_NAME';
  END IF;
  INSERT INTO public.leagues(owner_id,name) VALUES(uid,btrim(league_name)) RETURNING id INTO lid;
  SELECT p.name INTO display FROM public.contest_players p JOIN public.contest_memberships m
    ON m.contest_id=p.contest_id AND m.player_id=p.id
    WHERE m.user_id=uid AND m.status='approved' ORDER BY p.joined_at LIMIT 1;
  INSERT INTO public.league_memberships(league_id,user_id,display_name,role)
    VALUES(lid,uid,coalesce(nullif(btrim(display),''),'Host'),'host');
  RETURN lid;
END $$;

-- Linking is host-only and imports only already-approved event participants.
-- It never grants event access; every event retains its independent membership.
CREATE FUNCTION public.link_league_event(league_id uuid,contest_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE l public.leagues; c public.contests; uid uuid := auth.uid(); linked integer;
BEGIN
  IF uid IS NULL OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ACCOUNT_REQUIRED';
  END IF;
  SELECT * INTO l FROM public.leagues WHERE id=$1 AND owner_id=uid FOR UPDATE;
  IF l.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LEAGUE_HOST_REQUIRED'; END IF;
  SELECT * INTO c FROM public.contests WHERE id=$2 FOR UPDATE;
  IF c.id IS NULL OR c.owner_id<>uid OR NOT c.sync_enabled OR c.protocol<>1 THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='SYNCED_EVENT_HOST_REQUIRED';
  END IF;
  IF c.league_id IS NOT NULL AND c.league_id<>l.id THEN
    RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='EVENT_ALREADY_IN_ANOTHER_LEAGUE';
  END IF;
  INSERT INTO public.league_events(league_id,contest_id,linked_by)
    VALUES(l.id,c.id,uid) ON CONFLICT ON CONSTRAINT league_events_pkey DO NOTHING;
  UPDATE public.contests SET league_id=l.id WHERE id=c.id AND league_id IS NULL;

  -- Each approved event identity gets one reusable league player UUID. Event
  -- access remains controlled by contest_memberships, independently of roster.
  INSERT INTO public.league_memberships AS existing(league_id,user_id,display_name,role,status)
  SELECT l.id,m.user_id,coalesce(nullif(btrim(p.name),''),'Player'),
    CASE WHEN m.user_id=l.owner_id THEN 'host' ELSE 'player' END,'active'
  FROM public.contest_memberships m
  LEFT JOIN LATERAL (
    SELECT px.id,px.name FROM public.contest_players px
    WHERE px.contest_id=m.contest_id AND (px.id=m.player_id OR (m.player_id IS NULL AND px.user_id=m.user_id))
    ORDER BY (px.id=m.player_id) DESC LIMIT 1
  ) p ON true
  WHERE m.contest_id=c.id AND m.status='approved'
  ON CONFLICT ON CONSTRAINT league_memberships_pkey DO UPDATE SET
    display_name=CASE WHEN existing.display_name='Host' THEN EXCLUDED.display_name ELSE existing.display_name END,
    updated_at=now();

  INSERT INTO public.league_event_players(league_id,contest_id,league_player_id,contest_player_id)
  SELECT l.id,c.id,lm.league_player_id,p.id
  FROM public.contest_memberships m
  JOIN LATERAL (
    SELECT px.id FROM public.contest_players px
    WHERE px.contest_id=m.contest_id AND (px.id=m.player_id OR (m.player_id IS NULL AND px.user_id=m.user_id))
    ORDER BY (px.id=m.player_id) DESC LIMIT 1
  ) p ON true
  JOIN public.league_memberships lm ON lm.league_id=l.id AND lm.user_id=m.user_id AND lm.status='active'
  WHERE m.contest_id=c.id AND m.status='approved'
  ON CONFLICT ON CONSTRAINT league_event_players_pkey DO UPDATE SET contest_player_id=EXCLUDED.contest_player_id;
  GET DIAGNOSTICS linked=ROW_COUNT;
  RETURN jsonb_build_object('status','linked','mapped_players',linked);
END $$;

CREATE FUNCTION public.map_league_event_player(league_id uuid,contest_id uuid,league_player_id uuid,contest_player_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR NOT EXISTS(SELECT 1 FROM public.leagues l WHERE l.id=$1 AND l.owner_id=uid)
    OR NOT EXISTS(SELECT 1 FROM public.league_events e WHERE e.league_id=$1 AND e.contest_id=$2)
    OR NOT EXISTS(SELECT 1 FROM public.league_memberships m WHERE m.league_id=$1 AND m.league_player_id=$3 AND m.status='active')
    OR NOT EXISTS(SELECT 1 FROM public.contests c JOIN public.contest_players p ON p.contest_id=c.id
       WHERE c.id=$2 AND c.owner_id=uid AND p.id=$4 AND c.sync_enabled AND c.protocol=1) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LEAGUE_HOST_REQUIRED';
  END IF;
  INSERT INTO public.league_event_players(league_id,contest_id,league_player_id,contest_player_id)
    VALUES($1,$2,$3,$4)
    ON CONFLICT ON CONSTRAINT league_event_players_pkey DO UPDATE SET contest_player_id=EXCLUDED.contest_player_id;
  RETURN jsonb_build_object('status','mapped');
END $$;

CREATE FUNCTION public.set_league_member_status(league_id uuid,league_player_id uuid,active boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LEAGUE_HOST_REQUIRED'; END IF;
  PERFORM 1 FROM public.leagues l WHERE l.id=$1 AND l.owner_id=uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LEAGUE_HOST_REQUIRED';
  END IF;
  IF EXISTS(SELECT 1 FROM public.league_memberships m WHERE m.league_id=$1 AND m.league_player_id=$2 AND m.role='host') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='CANNOT_REMOVE_HOST';
  END IF;
  UPDATE public.league_memberships lm SET status=CASE WHEN $3 THEN 'active' ELSE 'removed' END,updated_at=now()
   WHERE lm.league_id=$1 AND lm.league_player_id=$2 AND lm.role='player';
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='LEAGUE_MEMBER_NOT_FOUND'; END IF;
  RETURN jsonb_build_object('status',CASE WHEN $3 THEN 'active' ELSE 'removed' END);
END $$;

CREATE FUNCTION public.list_league_roster(league_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE uid uuid := auth.uid(); roster jsonb;
BEGIN
  IF uid IS NULL OR NOT EXISTS(SELECT 1 FROM public.leagues l WHERE l.id=$1 AND l.owner_id=uid) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LEAGUE_HOST_REQUIRED';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('league_player_id',m.league_player_id,
    'display_name',m.display_name,'role',m.role,'status',m.status) ORDER BY m.role,m.display_name),'[]'::jsonb)
    INTO roster FROM public.league_memberships m WHERE m.league_id=$1;
  RETURN roster;
END $$;

CREATE FUNCTION public.list_league_event_map_options(league_id uuid,contest_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE uid uuid := auth.uid(); roster jsonb; players jsonb; mappings jsonb;
BEGIN
  IF uid IS NULL OR NOT EXISTS(SELECT 1 FROM public.leagues l JOIN public.league_events e ON e.league_id=l.id
    JOIN public.contests c ON c.id=e.contest_id WHERE l.id=$1 AND e.contest_id=$2 AND l.owner_id=uid AND c.owner_id=uid) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LEAGUE_HOST_REQUIRED';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.league_player_id,'name',m.display_name) ORDER BY m.display_name),'[]'::jsonb)
    INTO roster FROM public.league_memberships m WHERE m.league_id=$1 AND m.status='active';
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) ORDER BY p.sort_order,p.name),'[]'::jsonb)
    INTO players FROM public.contest_players p WHERE p.contest_id=$2;
  SELECT coalesce(jsonb_agg(jsonb_build_object('league_player_id',m.league_player_id,'contest_player_id',m.contest_player_id)),'[]'::jsonb)
    INTO mappings FROM public.league_event_players m WHERE m.league_id=$1 AND m.contest_id=$2;
  RETURN jsonb_build_object('roster',roster,'players',players,'mappings',mappings);
END $$;

-- A league membership can request a seat, but only the event host's existing
-- approval RPC grants event access. A missing mapping is never guessed by name.
CREATE FUNCTION public.request_league_event_join(league_id uuid,contest_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE uid uuid := auth.uid(); c public.contests; lm public.league_memberships; player uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AUTH_REQUIRED'; END IF;
  SELECT * INTO lm FROM public.league_memberships lm WHERE lm.league_id=$1 AND lm.user_id=uid AND lm.status='active';
  IF lm.user_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.league_events e WHERE e.league_id=$1 AND e.contest_id=$2) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LEAGUE_MEMBER_REQUIRED';
  END IF;
  SELECT * INTO c FROM public.contests WHERE id=$2 FOR UPDATE;
  IF c.id IS NULL OR NOT c.sync_enabled OR c.protocol<>1 OR c.status<>'active' THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='EVENT_NOT_JOINABLE';
  END IF;
  SELECT lep.contest_player_id INTO player FROM public.league_event_players lep
   WHERE lep.league_id=$1 AND lep.contest_id=$2 AND lep.league_player_id=lm.league_player_id;
  IF player IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='EVENT_PLAYER_NOT_MAPPED'; END IF;
  INSERT INTO public.contest_join_requests(contest_id,requester,requested_name,desired_player_id)
    VALUES(c.id,uid,lm.display_name,player)
    ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('status','pending');
END $$;

CREATE FUNCTION public.list_my_leagues() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'role',m.role,
    'member_count',(SELECT count(*) FROM public.league_memberships x WHERE x.league_id=l.id AND x.status='active'),
    'event_count',(SELECT count(*) FROM public.league_events x WHERE x.league_id=l.id)) ORDER BY l.created_at DESC),'[]'::jsonb)
  FROM public.league_memberships m JOIN public.leagues l ON l.id=m.league_id
  WHERE m.user_id=auth.uid() AND m.status='active';
$$;

CREATE FUNCTION public.list_league_events(league_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE uid uuid := auth.uid(); output jsonb; e record; authorized boolean; snap jsonb; rounds jsonb;
BEGIN
  IF uid IS NULL OR NOT EXISTS(SELECT 1 FROM public.league_memberships m WHERE m.league_id=$1 AND m.user_id=uid AND m.status='active') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='LEAGUE_MEMBER_REQUIRED';
  END IF;
  output := '[]'::jsonb;
  FOR e IN SELECT c.id,c.name,c.status,c.created_at,c.owner_id
    FROM public.league_events le JOIN public.contests c ON c.id=le.contest_id
    WHERE le.league_id=$1 ORDER BY c.created_at DESC LOOP
    authorized := e.owner_id=uid OR EXISTS(SELECT 1 FROM public.contest_memberships m
      WHERE m.contest_id=e.id AND m.user_id=uid AND m.status='approved');
    rounds := '[]'::jsonb;
    IF authorized THEN
      snap := public.fetch_snapshot(e.id,0);
      SELECT coalesce(jsonb_agg(jsonb_build_object('number',r->>'number','players',
        (SELECT coalesce(jsonb_agg(jsonb_build_object('name',p->>'displayName','holes',
          (SELECT coalesce(jsonb_agg(jsonb_build_object('hole',cell->'hole','strokes',cell->'strokes') ORDER BY (cell->>'hole')::integer),'[]'::jsonb)
           FROM jsonb_array_elements(p->'cells') cell)) ORDER BY p->>'displayName'),'[]'::jsonb)
         FROM jsonb_array_elements(r->'players') p)) ORDER BY (r->>'number')::integer),'[]'::jsonb)
      INTO rounds FROM jsonb_array_elements(snap->'rounds') r;
    END IF;
    output := output || jsonb_build_array(jsonb_build_object('id',e.id,'name',e.name,'status',e.status,
      'created_at',e.created_at,'authorized',authorized,'rounds',rounds));
  END LOOP;
  RETURN output;
END $$;

REVOKE ALL ON FUNCTION public.create_league(text),public.link_league_event(uuid,uuid),
 public.map_league_event_player(uuid,uuid,uuid,uuid),public.set_league_member_status(uuid,uuid,boolean),
 public.list_league_roster(uuid),public.list_league_event_map_options(uuid,uuid),
 public.request_league_event_join(uuid,uuid),public.list_my_leagues(),public.list_league_events(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_league(text),public.link_league_event(uuid,uuid),
 public.map_league_event_player(uuid,uuid,uuid,uuid),public.set_league_member_status(uuid,uuid,boolean),
 public.list_league_roster(uuid),public.list_league_event_map_options(uuid,uuid),
 public.request_league_event_join(uuid,uuid),public.list_my_leagues(),public.list_league_events(uuid) TO authenticated;

COMMIT;
