-- OFFLINE PROPOSAL ONLY. Requires Augie's explicit live migration approval.
-- Predecessor: 20261101190000_owner_invite_snapshot.sql (applied live as 20261102034550).
--
-- Round links for web guests (snapscore.autumn8.me). Owner decisions recorded on
-- AUG-1601, 2026-11-27 and 2026-11-28:
--  * player link: a guest picks which player they are and keeps the card for that
--    player's whole group. No account and no host approval.
--  * spectator link: sees everything a player sees, money included. Cannot score.
--  * the host sees who is keeping which card and can remove or reassign them.
--  * the 6-letter code on the website lets someone watch, never score.
--  * group host = whoever took a group's card first. A later scorer's change to an
--    existing score is flagged for the group host (or the organizer) to accept or deny.
--  * after the organizer finalizes, a scorer may "reopen" for one hour to fix a score.
--
-- This file only ADDS tables, functions and one trigger. The two rules that need the
-- existing score-writing function to change (flagging, reopen) are switched on by the
-- separate file 20261128010000_web_score_rules.sql; until that is applied the objects
-- here for flags and reopen exist but nothing calls them from a score write.
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
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX player_links_contest ON public.player_links(contest_id);

-- Who joined through which link, and which player they said they are. The chosen
-- player is a label for the host, not an exclusive claim: two people may keep a card.
CREATE TABLE public.player_link_members (
  contest_id uuid NOT NULL REFERENCES public.contests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL REFERENCES public.player_links(token_hash) ON DELETE CASCADE,
  player_id uuid NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contest_id, user_id),
  FOREIGN KEY (player_id, contest_id) REFERENCES public.contest_players(id, contest_id) ON DELETE CASCADE
);

-- Group host: whoever took a group's card first, on the web or in the app.
CREATE TABLE public.group_card_hosts (
  contest_id uuid NOT NULL, round_id uuid NOT NULL, group_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contest_id, round_id, group_id),
  FOREIGN KEY (group_id, contest_id, round_id) REFERENCES public.contest_groups(id, contest_id, round_id) ON DELETE CASCADE
);

-- A change a later scorer asked for on a score someone else entered. The entered score
-- keeps counting until the group host or the organizer accepts or denies the change.
CREATE TABLE public.score_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id uuid NOT NULL REFERENCES public.contests(id) ON DELETE CASCADE,
  round_id uuid NOT NULL, group_id uuid NOT NULL, player_id uuid NOT NULL,
  hole integer NOT NULL CHECK (hole BETWEEN 1 AND 18),
  proposed_action text NOT NULL CHECK (proposed_action IN ('set','clear')),
  proposed_strokes integer CHECK ((proposed_action='set' AND proposed_strokes BETWEEN 1 AND 15) OR (proposed_action='clear' AND proposed_strokes IS NULL)),
  proposed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','denied','reconciled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_by uuid, resolved_at timestamptz,
  FOREIGN KEY (player_id, contest_id) REFERENCES public.contest_players(id, contest_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX score_flags_one_pending ON public.score_flags(contest_id, round_id, player_id, hole, proposed_by) WHERE status='pending';
CREATE INDEX score_flags_contest_pending ON public.score_flags(contest_id) WHERE status='pending';

-- When the organizer finalized, and who has reopened their card since.
CREATE TABLE public.contest_finalizations (
  contest_id uuid PRIMARY KEY REFERENCES public.contests(id) ON DELETE CASCADE,
  finalized_at timestamptz NOT NULL DEFAULT now()
);
-- Watchers a code created. A rollback removes these and nobody else. (Review finding 6.)
CREATE TABLE public.watch_code_members (
  contest_id uuid NOT NULL REFERENCES public.contests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contest_id, user_id)
);
CREATE TABLE public.card_reopens (
  contest_id uuid NOT NULL REFERENCES public.contests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reopened_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contest_id, user_id)
);

ALTER TABLE public.player_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_links FORCE ROW LEVEL SECURITY;
ALTER TABLE public.player_link_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_link_members FORCE ROW LEVEL SECURITY;
ALTER TABLE public.group_card_hosts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_card_hosts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.score_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.score_flags FORCE ROW LEVEL SECURITY;
ALTER TABLE public.contest_finalizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contest_finalizations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.watch_code_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watch_code_members FORCE ROW LEVEL SECURITY;
ALTER TABLE public.card_reopens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_reopens FORCE ROW LEVEL SECURITY;
-- No policies: clients reach these tables only through the functions below.
REVOKE ALL ON public.player_links, public.player_link_members, public.group_card_hosts, public.score_flags,
 public.contest_finalizations, public.card_reopens, public.watch_code_members FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.player_links, public.player_link_members, public.group_card_hosts, public.score_flags,
 public.contest_finalizations, public.card_reopens, public.watch_code_members TO service_role;

-- Records the moment a round is finalized; clears it if the round is ever made active again.
CREATE FUNCTION public.note_contest_finalized() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.status='completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
  INSERT INTO public.contest_finalizations(contest_id,finalized_at) VALUES(NEW.id,now())
   ON CONFLICT (contest_id) DO UPDATE SET finalized_at=excluded.finalized_at;
  DELETE FROM public.card_reopens o WHERE o.contest_id=NEW.id;
 ELSIF NEW.status<>'completed' AND OLD.status='completed' THEN
  DELETE FROM public.contest_finalizations f WHERE f.contest_id=NEW.id;
  DELETE FROM public.card_reopens o WHERE o.contest_id=NEW.id;
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.note_contest_finalized() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER web_links_finalized AFTER UPDATE OF status ON public.contests FOR EACH ROW EXECUTE FUNCTION public.note_contest_finalized();

-- Internal: the group's host if that person may still score THAT GROUP, else NULL. A host who
-- was moved to another card, removed, or whose scope was revoked stops being the host at
-- once; the next person to take the card becomes it. (Review finding 2.)
CREATE FUNCTION public.group_card_host(p_contest uuid, p_round uuid, p_group uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT h.user_id FROM public.group_card_hosts h JOIN public.contests c ON c.id=h.contest_id
 WHERE h.contest_id=$1 AND h.round_id=$2 AND h.group_id=$3
 AND (h.user_id=c.owner_id OR EXISTS(SELECT 1 FROM public.contest_memberships m WHERE m.contest_id=h.contest_id AND m.user_id=h.user_id AND m.status='approved'
  AND ((m.role='scorer' AND EXISTS(SELECT 1 FROM public.round_scorer_scopes s WHERE s.contest_id=h.contest_id AND s.round_id=h.round_id AND s.group_id=h.group_id AND s.user_id=h.user_id AND s.status='approved'))
    OR (m.role='player' AND EXISTS(SELECT 1 FROM public.round_player_assignments a WHERE a.contest_id=h.contest_id AND a.round_id=h.round_id AND a.group_id=h.group_id AND a.player_id=m.player_id)))));
$$;
-- Internal: who may decide a flagged change for this player NOW: the host of the group the
-- player is in today. A flag keeps the group it was raised in, but the organizer can move a
-- player afterwards; the old group's host must not decide a score that has left their card.
-- A player in no group has no host, so only the organizer can decide. (Package review, B.)
CREATE FUNCTION public.flag_host(p_contest uuid, p_round uuid, p_player uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT public.group_card_host($1,$2,a.group_id) FROM public.round_player_assignments a
 WHERE a.contest_id=$1 AND a.round_id=$2 AND a.player_id=$3;
$$;

CREATE FUNCTION public.claim_group_cards(p_contest uuid, p_user uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 INSERT INTO public.group_card_hosts(contest_id,round_id,group_id,user_id)
 SELECT s.contest_id,s.round_id,s.group_id,$2 FROM public.round_scorer_scopes s
 WHERE s.contest_id=$1 AND s.user_id=$2 AND s.status='approved' AND public.group_card_host(s.contest_id,s.round_id,s.group_id) IS NULL
 ON CONFLICT (contest_id,round_id,group_id) DO UPDATE SET user_id=excluded.user_id,claimed_at=now();
$$;

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
 -- Nor any other membership a link did not create: a scorer the organizer appointed, or a
 -- join request still waiting, stays exactly as it is. (Review finding 6.)
 IF existing.user_id IS NOT NULL AND existing.status<>'revoked'
   AND NOT EXISTS(SELECT 1 FROM public.player_link_members j WHERE j.contest_id=cid AND j.user_id=uid) THEN
  RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='ALREADY_APPROVED'; END IF;
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
 -- First to take a group's card is its host.
 PERFORM public.claim_group_cards(cid,uid);
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
 PERFORM public.claim_group_cards($1,$2);
 UPDATE public.contests SET sync_revision=sync_revision+1 WHERE id=$1;
 RETURN jsonb_build_object('status','assigned','player_id',$3,'groups',n);
END $$;

-- The 6-letter code on the website: watch only.
-- Its own attempt budget ("watch:" scopes), so a flood of guesses here cannot use up the
-- app's join budget; 5 a minute per session, 300 a minute overall, and at most 60 new
-- watchers a minute per round. Every refusal gives the same answer as a wrong code. A right
-- code necessarily shows the round, so guessing is slowed, not hidden. (Review finding 7.)
-- It only ever creates a watcher for someone with no membership at all: a join request
-- still waiting, or a removed member, is left exactly as it is. (Review finding 6.)
CREATE FUNCTION public.watch_code(code text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE cid uuid; owner uuid; uid uuid:=auth.uid(); n integer; bucket timestamptz:=date_trunc('minute',clock_timestamp()); k text; existing public.contest_memberships;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='AUTH_REQUIRED'; END IF;
 IF code IS NULL OR length(code)>32 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_REQUEST'; END IF;
 FOREACH k IN ARRAY ARRAY['watch:global','watch:actor:'||uid::text] LOOP
  INSERT INTO public.sync_join_budgets AS b VALUES(k,bucket,1) ON CONFLICT(scope) DO UPDATE SET
   attempts=CASE WHEN b.window_start=bucket THEN least(b.attempts+1,301) ELSE 1 END,window_start=bucket RETURNING attempts INTO n;
  IF n>(CASE WHEN k='watch:global' THEN 300 ELSE 5 END) THEN RETURN '{"status":"unknown"}'::jsonb; END IF;
 END LOOP;
 SELECT c.id,c.owner_id INTO cid,owner FROM public.contests c WHERE c.invite_code=upper(btrim(code)) AND c.protocol=1 AND c.sync_enabled FOR UPDATE;
 IF cid IS NULL THEN RETURN '{"status":"unknown"}'::jsonb; END IF;
 IF uid=owner THEN RETURN jsonb_build_object('status','watching','contest_id',cid); END IF;
 SELECT * INTO existing FROM public.contest_memberships m WHERE m.contest_id=cid AND m.user_id=uid;
 IF existing.status='approved' THEN RETURN jsonb_build_object('status','watching','contest_id',cid); END IF;
 IF existing.user_id IS NOT NULL OR (SELECT count(*) FROM public.contest_memberships m WHERE m.contest_id=cid AND m.role='viewer' AND m.status='approved')>=500 THEN
  RETURN '{"status":"unknown"}'::jsonb; END IF;
 INSERT INTO public.sync_join_budgets AS b VALUES('watch:contest:'||cid::text,bucket,1) ON CONFLICT(scope) DO UPDATE SET
  attempts=CASE WHEN b.window_start=bucket THEN least(b.attempts+1,301) ELSE 1 END,window_start=bucket RETURNING attempts INTO n;
 IF n>60 THEN RETURN '{"status":"unknown"}'::jsonb; END IF;
 INSERT INTO public.contest_memberships(contest_id,user_id,role,player_id,status) VALUES(cid,uid,'viewer',NULL,'approved');
 INSERT INTO public.watch_code_members(contest_id,user_id) VALUES(cid,uid);
 RETURN jsonb_build_object('status','watching','contest_id',cid);
END $$;

-- After the organizer finalizes, anyone who could score the round may reopen their card
-- for one hour from the moment of finalizing. Takes effect only once
-- 20261128010000_web_score_rules.sql is applied.
CREATE FUNCTION public.reopen_card(contest_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c public.contests; uid uuid:=auth.uid(); f timestamptz;
BEGIN
 SELECT * INTO c FROM public.contests WHERE id=$1 FOR UPDATE;
 IF uid IS NULL OR c.id IS NULL OR NOT ((c.owner_id=uid AND NOT coalesce((auth.jwt()->>'is_anonymous')::boolean,false))
   OR EXISTS(SELECT 1 FROM public.contest_memberships m WHERE m.contest_id=$1 AND m.user_id=uid AND m.status='approved' AND m.role IN ('player','scorer')))
  THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='FORBIDDEN'; END IF;
 SELECT x.finalized_at INTO f FROM public.contest_finalizations x WHERE x.contest_id=$1;
 IF NOT c.sync_enabled OR c.protocol<>1 OR c.status<>'completed' OR f IS NULL OR f<=now()-interval '1 hour' THEN
  RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='REOPEN_CLOSED'; END IF;
 INSERT INTO public.card_reopens AS o(contest_id,user_id) VALUES($1,uid) ON CONFLICT ON CONSTRAINT card_reopens_pkey DO UPDATE SET reopened_at=now();
 RETURN jsonb_build_object('status','reopened','until',f+interval '1 hour');
END $$;

-- Pending flagged changes the caller may see: the organizer sees all, a group host sees
-- their groups, and everyone sees what they proposed themselves.
CREATE FUNCTION public.list_score_flags(contest_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c public.contests; uid uuid:=auth.uid(); org boolean;
BEGIN
 SELECT * INTO c FROM public.contests WHERE id=$1 FOR SHARE;
 org := c.owner_id=uid AND NOT coalesce((auth.jwt()->>'is_anonymous')::boolean,false);
 IF uid IS NULL OR c.id IS NULL OR NOT (org OR EXISTS(SELECT 1 FROM public.contest_memberships m WHERE m.contest_id=$1 AND m.user_id=uid AND m.status='approved'))
  THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='FORBIDDEN'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',f.id,'round_id',f.round_id,'group_id',f.group_id,'player_id',f.player_id,'player_name',p.name,'hole',f.hole,
   'current_strokes',(SELECT e.strokes FROM public.score_events e WHERE e.contest_id=f.contest_id AND e.round_id=f.round_id AND e.player_id=f.player_id AND e.hole=f.hole AND e.cell_version IS NOT NULL ORDER BY e.cell_version DESC LIMIT 1),
   'proposed_strokes',f.proposed_strokes,'mine',f.proposed_by=uid,
   'can_resolve',org OR coalesce(public.flag_host(f.contest_id,f.round_id,f.player_id)=uid,false),'created_at',f.created_at) ORDER BY f.created_at,f.id),'[]'::jsonb)
  FROM public.score_flags f JOIN public.contest_players p ON p.id=f.player_id
  WHERE f.contest_id=$1 AND f.status='pending' AND (org OR f.proposed_by=uid OR coalesce(public.flag_host(f.contest_id,f.round_id,f.player_id)=uid,false)));
END $$;

-- The group host or the organizer accepts (the proposed score replaces the entered one)
-- or denies (the entered score stands). Either way the flag is closed.
CREATE FUNCTION public.resolve_score_flag(flag_id uuid, accept boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE f public.score_flags; c public.contests; uid uuid:=auth.uid(); org boolean; version bigint; open_now boolean;
BEGIN
 SELECT x.contest_id INTO f.contest_id FROM public.score_flags x WHERE x.id=$1;
 SELECT * INTO c FROM public.contests WHERE id=f.contest_id FOR UPDATE;
 SELECT * INTO f FROM public.score_flags x WHERE x.id=$1 FOR UPDATE;
 org := c.owner_id=uid AND NOT coalesce((auth.jwt()->>'is_anonymous')::boolean,false);
 -- Fails closed (review finding 1): with no valid host the lookup is NULL, and NULL must refuse.
 IF uid IS NULL OR c.id IS NULL OR f.id IS NULL OR org IS NULL
   OR NOT (org OR coalesce(public.flag_host(f.contest_id,f.round_id,f.player_id)=uid,false))
  THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='FORBIDDEN'; END IF;
 IF f.status<>'pending' OR accept IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_REQUEST'; END IF;
 open_now := c.status='active' OR (c.status='completed' AND EXISTS(SELECT 1 FROM public.contest_finalizations z WHERE z.contest_id=c.id AND z.finalized_at>now()-interval '1 hour'));
 IF NOT c.sync_enabled OR c.protocol<>1 OR NOT open_now THEN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='SYNC_PAUSED'; END IF;
 IF accept THEN
  SELECT coalesce(max(e.cell_version),0) INTO version FROM public.score_events e
   WHERE e.contest_id=f.contest_id AND e.round_id=f.round_id AND e.player_id=f.player_id AND e.hole=f.hole AND e.cell_version IS NOT NULL;
  UPDATE public.contests SET sync_revision=sync_revision+1 WHERE id=c.id RETURNING * INTO c;
  INSERT INTO public.score_events(contest_id,round_id,player_id,hole,action,strokes,entered_by,actor,cell_version,contest_revision,op_id,request_hash)
   VALUES(f.contest_id,f.round_id,f.player_id,f.hole,f.proposed_action,f.proposed_strokes,uid,uid,version+1,c.sync_revision,gen_random_uuid(),'flag:'||f.id::text);
  IF c.status='active' THEN
   -- The card that changes is the player's group today, which may not be the group saved on the flag.
   DELETE FROM public.group_submissions s USING public.round_player_assignments a
    WHERE a.contest_id=f.contest_id AND a.round_id=f.round_id AND a.player_id=f.player_id
    AND s.contest_id=a.contest_id AND s.round_id=a.round_id AND s.group_id=a.group_id;
  END IF;
  -- Other people who asked for the same value are settled by this too.
  UPDATE public.score_flags x SET status='reconciled',resolved_by=uid,resolved_at=now()
   WHERE x.contest_id=f.contest_id AND x.round_id=f.round_id AND x.player_id=f.player_id AND x.hole=f.hole AND x.status='pending' AND x.id<>f.id
   AND x.proposed_action=f.proposed_action AND x.proposed_strokes IS NOT DISTINCT FROM f.proposed_strokes;
 ELSE
  UPDATE public.contests SET sync_revision=sync_revision+1 WHERE id=c.id RETURNING * INTO c;
 END IF;
 UPDATE public.score_flags x SET status=CASE WHEN accept THEN 'accepted' ELSE 'denied' END,resolved_by=uid,resolved_at=now() WHERE x.id=f.id;
 RETURN jsonb_build_object('status',CASE WHEN accept THEN 'accepted' ELSE 'denied' END,'revision',c.sync_revision);
END $$;

REVOKE ALL ON FUNCTION public.round_link_contest(text,text),public.new_round_link(uuid,text),
 public.create_player_link(uuid),public.create_spectator_link(uuid),public.revoke_player_links(uuid),public.revoke_spectator_links(uuid),
 public.player_link_roster(text),public.join_player_link(text,uuid),public.spectator_board(text),
 public.list_player_link_members(uuid),public.assign_player_link_member(uuid,uuid,uuid),
 public.group_card_host(uuid,uuid,uuid),public.flag_host(uuid,uuid,uuid),public.claim_group_cards(uuid,uuid),public.watch_code(text),public.reopen_card(uuid),
 public.list_score_flags(uuid),public.resolve_score_flag(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_player_link(uuid),public.create_spectator_link(uuid),public.revoke_player_links(uuid),public.revoke_spectator_links(uuid),
 public.player_link_roster(text),public.join_player_link(text,uuid),
 public.list_player_link_members(uuid),public.assign_player_link_member(uuid,uuid,uuid),
 public.watch_code(text),public.reopen_card(uuid),public.list_score_flags(uuid),public.resolve_score_flag(uuid,boolean) TO authenticated,service_role;
-- The spectator board is the one function a visitor with no session may call.
GRANT EXECUTE ON FUNCTION public.spectator_board(text) TO anon,authenticated,service_role;

-- THE ONE CHANGE TO AN EXISTING FUNCTION IN THIS FILE. (Package review, B.)
-- When an organizer deletes their account, public.purge_account hands their rounds to
-- "any membership", whatever its role or status. This file adds two new kinds of membership
-- that anyone with a code or link can get (watchers, web guests), so that rule would let a
-- stranger inherit a round. The successor must now be an approved host or player, or a
-- bound player, with a real (not guest) account. With nobody eligible the round is removed
-- with its organizer, exactly as it already is when nobody else is in it.
-- This also stops what could already happen before this file: a round passing to someone
-- whose join request was still waiting, who had been removed, or who is a guest account.
-- Only those two WHERE clauses change; owner, grants and settings are kept. It refuses to
-- run unless the function is exactly production's, and checks the result.
DO $purge$
DECLARE def text; body text; o oid := 'public.purge_account(uuid)'::regprocedure;
BEGIN
 SELECT p.prosrc, pg_get_functiondef(p.oid) INTO body, def FROM pg_proc p WHERE p.oid=o;
 IF md5(body) IS DISTINCT FROM '16712b9d8713a846eb83585b4e6ad714' THEN RAISE EXCEPTION 'purge_account is not the expected version (before)'; END IF;
 IF (length(def)-length(replace(def,$a$      WHERE m.contest_id = cid AND m.user_id <> p_user_id
$a$,'')))<>length($a$      WHERE m.contest_id = cid AND m.user_id <> p_user_id
$a$) OR (length(def)-length(replace(def,$b$      WHERE p.contest_id = cid AND p.user_id IS NOT NULL AND p.user_id <> p_user_id
$b$,'')))<>length($b$      WHERE p.contest_id = cid AND p.user_id IS NOT NULL AND p.user_id <> p_user_id
$b$) THEN
  RAISE EXCEPTION 'purge_account: the successor rule was not found exactly once'; END IF;
 EXECUTE replace(replace(def,$a$      WHERE m.contest_id = cid AND m.user_id <> p_user_id
$a$,$c$      WHERE m.contest_id = cid AND m.user_id <> p_user_id
        AND m.status = 'approved' AND m.role IN ('host', 'player')
        AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = m.user_id AND u.is_anonymous)
$c$),$b$      WHERE p.contest_id = cid AND p.user_id IS NOT NULL AND p.user_id <> p_user_id
$b$,$d$      WHERE p.contest_id = cid AND p.user_id IS NOT NULL AND p.user_id <> p_user_id
        AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.user_id AND u.is_anonymous)
$d$);
 IF (SELECT md5(p.prosrc) FROM pg_proc p WHERE p.oid=o) IS DISTINCT FROM '81bc3452d2897823c4c87b14f7f69474' THEN RAISE EXCEPTION 'purge_account did not end as the reviewed body'; END IF;
END $purge$;
NOTIFY pgrst, 'reload schema';
COMMIT;
