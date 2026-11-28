-- OFFLINE PROPOSAL ONLY. Requires Augie's explicit live migration approval.
-- Predecessor: 20261101190000_owner_invite_snapshot.sql (applied live as 20261102034550).
--
-- Round links for web guests (snapscore.autumn8.me). Owner decisions recorded on
-- AUG-1601, 2026-11-27 and 2026-11-28:
--  * player link: a guest picks which player they are and keeps the card for that
--    player's whole group. No account and no host approval.
--  * spectator link: sees everything a player sees, money included. Cannot score.
--  * the host sees who is keeping which card and can remove or reassign them.
--
-- Additive only. No existing table, function, policy or grant is changed. A guest
-- joined this way is an ordinary approved 'scorer' with round_scorer_scopes rows, so
-- submit_score, fetch_snapshot, sync_capabilities and the realtime policy already
-- authorize exactly the group, and revoke_membership already removes them.
BEGIN;

CREATE TABLE public.player_links (
  token_hash text PRIMARY KEY,
  kind text NOT NULL DEFAULT 'player' CHECK (kind IN ('player','spectator')),
  contest_id uuid NOT NULL REFERENCES public.contests(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX player_links_contest ON public.player_links(contest_id);

-- Who joined through which link, and which player they said they are. The chosen
-- player is a label for the host, not an exclusive claim: two people may keep a card.
CREATE TABLE public.player_link_members (
  contest_id uuid NOT NULL REFERENCES public.contests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  token_hash text NOT NULL REFERENCES public.player_links(token_hash) ON DELETE CASCADE,
  player_id uuid NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contest_id, user_id),
  FOREIGN KEY (player_id, contest_id) REFERENCES public.contest_players(id, contest_id) ON DELETE CASCADE
);

ALTER TABLE public.player_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_links FORCE ROW LEVEL SECURITY;
ALTER TABLE public.player_link_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_link_members FORCE ROW LEVEL SECURITY;
-- No policies: clients reach these tables only through the functions below.
REVOKE ALL ON public.player_links, public.player_link_members FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.player_links, public.player_link_members TO service_role;

-- Internal: the contest a live token belongs to, or NULL. Never granted to clients.
CREATE FUNCTION public.round_link_contest(p_token text, p_kind text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT l.contest_id FROM public.player_links l
 WHERE $1 ~ '^[a-f0-9]{64}$' AND l.token_hash=encode(extensions.digest($1,'sha256'),'hex') AND l.kind=$2 AND l.revoked_at IS NULL;
$$;

-- Internal. Host only. Returns the raw token once; only its hash is stored.
CREATE FUNCTION public.new_round_link(contest_id uuid, kind text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c public.contests; token text;
BEGIN
 SELECT * INTO c FROM public.contests WHERE id=$1 FOR UPDATE;
 IF c.id IS NULL OR auth.uid() IS NULL OR c.owner_id<>auth.uid() OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN
  RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='HOST_REQUIRED'; END IF;
 IF NOT c.sync_enabled OR c.protocol<>1 OR c.status<>'active' THEN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='SYNC_PAUSED'; END IF;
 IF (SELECT count(*) FROM public.player_links l WHERE l.contest_id=$1 AND l.kind=$2 AND l.revoked_at IS NULL)>=20 THEN
  RAISE EXCEPTION USING ERRCODE='54000', MESSAGE='LINK_LIMIT'; END IF;
 token := encode(extensions.gen_random_bytes(32),'hex');
 INSERT INTO public.player_links(token_hash,kind,contest_id,created_by) VALUES(encode(extensions.digest(token,'sha256'),'hex'),$2,$1,auth.uid());
 RETURN token;
END $$;
CREATE FUNCTION public.create_player_link(contest_id uuid) RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT public.new_round_link($1,'player') $$;
CREATE FUNCTION public.create_spectator_link(contest_id uuid) RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT public.new_round_link($1,'spectator') $$;

-- Host only. Ends every player link of the round and removes everyone who joined by one.
-- Spectator links are separate and keep working.
CREATE FUNCTION public.revoke_player_links(contest_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c public.contests; n integer;
BEGIN
 SELECT * INTO c FROM public.contests WHERE id=$1 FOR UPDATE;
 IF c.id IS NULL OR auth.uid() IS NULL OR c.owner_id<>auth.uid() OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN
  RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='HOST_REQUIRED'; END IF;
 UPDATE public.player_links l SET revoked_at=now() WHERE l.contest_id=$1 AND l.kind='player' AND l.revoked_at IS NULL;
 UPDATE public.round_scorer_scopes s SET status='revoked' WHERE s.contest_id=$1 AND s.user_id IN (SELECT j.user_id FROM public.player_link_members j WHERE j.contest_id=$1);
 UPDATE public.contest_memberships m SET status='revoked',updated_at=now() WHERE m.contest_id=$1 AND m.role='scorer' AND m.status='approved'
  AND m.user_id IN (SELECT j.user_id FROM public.player_link_members j WHERE j.contest_id=$1);
 GET DIAGNOSTICS n = ROW_COUNT;
 DELETE FROM public.player_link_members j WHERE j.contest_id=$1;
 UPDATE public.contests SET sync_revision=sync_revision+1 WHERE id=$1;
 RETURN jsonb_build_object('status','revoked','members',n);
END $$;

-- Any signed-in session (a guest session counts) holding a live token: names only,
-- so the guest can pick who they are. No scores, handicaps, money or invite code.
CREATE FUNCTION public.player_link_roster(p_token text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE cid uuid; c public.contests;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='AUTH_REQUIRED'; END IF;
 cid := public.round_link_contest($1,'player');
 IF cid IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_LINK'; END IF;
 SELECT * INTO c FROM public.contests WHERE id=cid FOR SHARE;
 -- 'me' lets a returning guest land back on the card they were keeping.
 RETURN jsonb_build_object('contest_id',c.id,'name',c.name,'open',c.sync_enabled AND c.protocol=1 AND c.status='active',
  'me',(SELECT j.player_id FROM public.player_link_members j JOIN public.contest_memberships m ON m.contest_id=j.contest_id AND m.user_id=j.user_id AND m.status='approved' AND m.role='scorer' WHERE j.contest_id=c.id AND j.user_id=auth.uid()),
  'rounds',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'number',r.round_number,'name',r.name,
   'groups',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,
     'players',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'displayName',p.name) ORDER BY p.sort_order,p.id),'[]'::jsonb)
       FROM public.round_player_assignments a JOIN public.contest_players p ON p.id=a.player_id AND p.contest_id=a.contest_id
       WHERE a.contest_id=c.id AND a.round_id=r.id AND a.group_id=g.id)) ORDER BY g.sort_order,g.id),'[]'::jsonb)
     FROM public.contest_groups g WHERE g.contest_id=c.id AND g.round_id=r.id)) ORDER BY r.round_number),'[]'::jsonb)
   FROM public.contest_rounds r WHERE r.contest_id=c.id));
END $$;

-- Straight in: the caller becomes an approved scorer for the chosen player's group in
-- every round that player is assigned to. Choosing again moves the caller to the new group.
CREATE FUNCTION public.join_player_link(p_token text, p_player_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE cid uuid; c public.contests; uid uuid := auth.uid(); existing public.contest_memberships; hash text; n integer;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='AUTH_REQUIRED'; END IF;
 cid := public.round_link_contest($1,'player');
 IF cid IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_LINK'; END IF;
 SELECT * INTO c FROM public.contests WHERE id=cid FOR UPDATE;
 -- Re-check under the contest lock: the host may have revoked the link meanwhile.
 hash := encode(extensions.digest($1,'sha256'),'hex');
 IF NOT EXISTS(SELECT 1 FROM public.player_links l WHERE l.token_hash=hash AND l.contest_id=cid AND l.kind='player' AND l.revoked_at IS NULL) THEN
  RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_LINK'; END IF;
 IF NOT c.sync_enabled OR c.protocol<>1 OR c.status<>'active' THEN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='SYNC_PAUSED'; END IF;
 IF uid=c.owner_id THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='HOST_SLOT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.round_player_assignments a WHERE a.contest_id=cid AND a.player_id=$2) THEN
  RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_PLAYER'; END IF;
 SELECT * INTO existing FROM public.contest_memberships m WHERE m.contest_id=cid AND m.user_id=uid;
 -- A host-approved player keeps that binding; a link never rewrites it.
 IF existing.status='approved' AND existing.role<>'scorer' THEN RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='ALREADY_APPROVED'; END IF;
 -- A member the host removed does not come back through the same link.
 IF existing.status='revoked' THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='FORBIDDEN'; END IF;
 IF existing.user_id IS NULL AND (SELECT count(*) FROM public.player_link_members j WHERE j.contest_id=cid)>=200 THEN
  RAISE EXCEPTION USING ERRCODE='54000', MESSAGE='MEMBER_LIMIT'; END IF;
 INSERT INTO public.contest_memberships(contest_id,user_id,role,player_id,status) VALUES(cid,uid,'scorer',NULL,'approved')
  ON CONFLICT (contest_id,user_id) DO UPDATE SET role='scorer',player_id=NULL,status='approved',updated_at=now();
 UPDATE public.round_scorer_scopes s SET status='revoked' WHERE s.contest_id=cid AND s.user_id=uid;
 INSERT INTO public.round_scorer_scopes(contest_id,round_id,group_id,user_id,status)
  SELECT a.contest_id,a.round_id,a.group_id,uid,'approved' FROM public.round_player_assignments a WHERE a.contest_id=cid AND a.player_id=$2
  ON CONFLICT (contest_id,round_id,group_id,user_id) DO UPDATE SET status='approved';
 GET DIAGNOSTICS n = ROW_COUNT;
 INSERT INTO public.player_link_members(contest_id,user_id,token_hash,player_id) VALUES(cid,uid,hash,$2)
  ON CONFLICT (contest_id,user_id) DO UPDATE SET token_hash=excluded.token_hash,player_id=excluded.player_id,joined_at=now();
 UPDATE public.contests SET sync_revision=sync_revision+1 WHERE id=cid;
 RETURN jsonb_build_object('status','joined','contest_id',cid,'player_id',$2,'groups',n);
END $$;

-- Host only. Ends every spectator link of the round. Nobody is a member through one.
CREATE FUNCTION public.revoke_spectator_links(contest_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c public.contests; n integer;
BEGIN
 SELECT * INTO c FROM public.contests WHERE id=$1 FOR UPDATE;
 IF c.id IS NULL OR auth.uid() IS NULL OR c.owner_id<>auth.uid() OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN
  RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='HOST_REQUIRED'; END IF;
 UPDATE public.player_links l SET revoked_at=now() WHERE l.contest_id=$1 AND l.kind='spectator' AND l.revoked_at IS NULL;
 GET DIAGNOSTICS n = ROW_COUNT;
 RETURN jsonb_build_object('status','revoked','links',n);
END $$;

-- Anyone holding a live spectator link, with or without a session: the round as the
-- players see it (scores, games and stakes), read-only. Same projection as fetch_snapshot
-- without the owner-only invite code, the realtime channel or the local id map.
-- supabase/tests/web-player-links.sql asserts it stays equal to fetch_snapshot.
CREATE FUNCTION public.spectator_board(p_token text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE cid uuid; c public.contests;
BEGIN
 cid := public.round_link_contest($1,'spectator');
 IF cid IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_LINK'; END IF;
 SELECT * INTO c FROM public.contests WHERE id=cid;
 IF c.protocol<>1 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_LINK'; END IF;
 RETURN jsonb_build_object('contest_id',c.id,'name',c.name,'course',public.sync_course(c.course),'protocol',c.protocol,'revision',c.sync_revision,'completed',c.status='completed','games',c.sync_games,'game_settings',c.sync_game_settings,'id_map','[]'::jsonb,
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
 FROM public.contest_rounds r WHERE r.contest_id=c.id));
END $$;

-- Host only: who is keeping which card on the web. A web scorer has no name; the
-- player they picked and the groups they can score identify them.
CREATE FUNCTION public.list_player_link_members(contest_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c public.contests;
BEGIN
 SELECT * INTO c FROM public.contests WHERE id=$1 FOR SHARE;
 IF c.id IS NULL OR auth.uid() IS NULL OR c.owner_id<>auth.uid() OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN
  RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='HOST_REQUIRED'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('member_id',j.user_id,'player_id',j.player_id,'player_name',p.name,'joined_at',j.joined_at,
   'groups',(SELECT coalesce(jsonb_agg(jsonb_build_object('round_id',s.round_id,'group_id',s.group_id,'name',g.name) ORDER BY r.round_number),'[]'::jsonb)
     FROM public.round_scorer_scopes s JOIN public.contest_groups g ON g.id=s.group_id JOIN public.contest_rounds r ON r.id=s.round_id
     WHERE s.contest_id=j.contest_id AND s.user_id=j.user_id AND s.status='approved')) ORDER BY j.joined_at,j.user_id),'[]'::jsonb)
  FROM public.player_link_members j JOIN public.contest_players p ON p.id=j.player_id
  JOIN public.contest_memberships m ON m.contest_id=j.contest_id AND m.user_id=j.user_id AND m.status='approved' AND m.role='scorer'
  WHERE j.contest_id=$1);
END $$;

-- Host only: move a web scorer to another player's group. Removing one is the existing
-- revoke_membership(contest_id, member_id).
CREATE FUNCTION public.assign_player_link_member(p_contest_id uuid, p_member_id uuid, p_player_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c public.contests; n integer;
BEGIN
 SELECT * INTO c FROM public.contests WHERE id=$1 FOR UPDATE;
 IF c.id IS NULL OR auth.uid() IS NULL OR c.owner_id<>auth.uid() OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN
  RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='HOST_REQUIRED'; END IF;
 IF NOT c.sync_enabled OR c.protocol<>1 OR c.status<>'active' THEN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='SYNC_PAUSED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.player_link_members j JOIN public.contest_memberships m ON m.contest_id=j.contest_id AND m.user_id=j.user_id
   WHERE j.contest_id=$1 AND j.user_id=$2 AND m.status='approved' AND m.role='scorer') THEN
  RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_MEMBER'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.round_player_assignments a WHERE a.contest_id=$1 AND a.player_id=$3) THEN
  RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_PLAYER'; END IF;
 UPDATE public.round_scorer_scopes s SET status='revoked' WHERE s.contest_id=$1 AND s.user_id=$2;
 INSERT INTO public.round_scorer_scopes(contest_id,round_id,group_id,user_id,status)
  SELECT a.contest_id,a.round_id,a.group_id,$2,'approved' FROM public.round_player_assignments a WHERE a.contest_id=$1 AND a.player_id=$3
  ON CONFLICT (contest_id,round_id,group_id,user_id) DO UPDATE SET status='approved';
 GET DIAGNOSTICS n = ROW_COUNT;
 UPDATE public.player_link_members j SET player_id=$3 WHERE j.contest_id=$1 AND j.user_id=$2;
 UPDATE public.contests SET sync_revision=sync_revision+1 WHERE id=$1;
 RETURN jsonb_build_object('status','assigned','player_id',$3,'groups',n);
END $$;

REVOKE ALL ON FUNCTION public.round_link_contest(text,text),public.new_round_link(uuid,text),
 public.create_player_link(uuid),public.create_spectator_link(uuid),public.revoke_player_links(uuid),public.revoke_spectator_links(uuid),
 public.player_link_roster(text),public.join_player_link(text,uuid),public.spectator_board(text),
 public.list_player_link_members(uuid),public.assign_player_link_member(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_player_link(uuid),public.create_spectator_link(uuid),public.revoke_player_links(uuid),public.revoke_spectator_links(uuid),
 public.player_link_roster(text),public.join_player_link(text,uuid),
 public.list_player_link_members(uuid),public.assign_player_link_member(uuid,uuid,uuid) TO authenticated,service_role;
-- The spectator board is the one function a visitor with no session may call.
GRANT EXECUTE ON FUNCTION public.spectator_board(text) TO anon,authenticated,service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
