-- Rollback for proposed/20261128000000_web_player_links.sql.
-- Removes everyone who joined by a player link, then the link objects. Scores those
-- guests entered stay: accepted score events are never deleted by a rollback.
BEGIN;
LOCK TABLE public.contests IN ACCESS EXCLUSIVE MODE;
UPDATE public.round_scorer_scopes s SET status='revoked'
 WHERE EXISTS(SELECT 1 FROM public.player_link_members j WHERE j.contest_id=s.contest_id AND j.user_id=s.user_id);
UPDATE public.contest_memberships m SET status='revoked',updated_at=now()
 WHERE m.role='scorer' AND m.status='approved'
 AND EXISTS(SELECT 1 FROM public.player_link_members j WHERE j.contest_id=m.contest_id AND j.user_id=m.user_id);
UPDATE public.contests c SET sync_revision=sync_revision+1
 WHERE EXISTS(SELECT 1 FROM public.player_link_members j WHERE j.contest_id=c.id);
-- Refuse while the score rules file is still applied: it calls objects dropped here.
DO $$ BEGIN
 IF (SELECT p.prosrc LIKE '%score_flags%' FROM pg_proc p WHERE p.oid='public.submit_score(uuid,uuid,uuid,integer,text,integer,bigint,uuid,text,bigint)'::regprocedure) THEN
  RAISE EXCEPTION 'Roll back 20261128010000_web_score_rules.sql first';
 END IF;
END $$;
-- Code spectators lose access with the feature.
-- Only the watchers a code created. A viewer who was there before is not touched.
UPDATE public.contest_memberships m SET status='revoked',updated_at=now() WHERE m.role='viewer' AND m.status='approved'
 AND EXISTS(SELECT 1 FROM public.watch_code_members w WHERE w.contest_id=m.contest_id AND w.user_id=m.user_id);
DELETE FROM public.sync_join_budgets b WHERE b.scope LIKE 'watch:%';
DROP TRIGGER web_links_finalized ON public.contests;
DROP FUNCTION public.note_contest_finalized();
DROP FUNCTION public.resolve_score_flag(uuid,boolean);
DROP FUNCTION public.list_score_flags(uuid);
DROP FUNCTION public.reopen_card(uuid);
DROP FUNCTION public.watch_code(text);
DROP FUNCTION public.assign_player_link_member(uuid,uuid,uuid);
DROP FUNCTION public.list_player_link_members(uuid);
DROP FUNCTION public.spectator_board(text);
DROP FUNCTION public.join_player_link(text,uuid);
DROP FUNCTION public.player_link_roster(text);
DROP FUNCTION public.revoke_spectator_links(uuid);
DROP FUNCTION public.revoke_player_links(uuid);
DROP FUNCTION public.create_spectator_link(uuid);
DROP FUNCTION public.create_player_link(uuid);
DROP FUNCTION public.new_round_link(uuid,text);
DROP FUNCTION public.round_link_contest(text,text);
DROP FUNCTION public.claim_group_cards(uuid,uuid);
DROP FUNCTION public.flag_host(uuid,uuid,uuid);
DROP FUNCTION public.group_card_host(uuid,uuid,uuid);
DROP TABLE public.watch_code_members;
DROP TABLE public.card_reopens;
DROP TABLE public.contest_finalizations;
DROP TABLE public.score_flags;
DROP TABLE public.group_card_hosts;
DROP TABLE public.player_link_members;
DROP TABLE public.player_links;
-- Put public.purge_account's successor rule back exactly as it was.
DO $purge$
DECLARE def text; body text; o oid := 'public.purge_account(uuid)'::regprocedure;
BEGIN
 SELECT p.prosrc, pg_get_functiondef(p.oid) INTO body, def FROM pg_proc p WHERE p.oid=o;
 IF md5(body) IS DISTINCT FROM '81bc3452d2897823c4c87b14f7f69474' THEN RAISE EXCEPTION 'purge_account is not the expected version (rollback)'; END IF;
 IF (length(def)-length(replace(def,$a$      WHERE m.contest_id = cid AND m.user_id <> p_user_id
        AND m.status = 'approved' AND m.role IN ('host', 'player')
        AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = m.user_id AND u.is_anonymous)
$a$,'')))<>length($a$      WHERE m.contest_id = cid AND m.user_id <> p_user_id
        AND m.status = 'approved' AND m.role IN ('host', 'player')
        AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = m.user_id AND u.is_anonymous)
$a$) OR (length(def)-length(replace(def,$b$      WHERE p.contest_id = cid AND p.user_id IS NOT NULL AND p.user_id <> p_user_id
        AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.user_id AND u.is_anonymous)
$b$,'')))<>length($b$      WHERE p.contest_id = cid AND p.user_id IS NOT NULL AND p.user_id <> p_user_id
        AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.user_id AND u.is_anonymous)
$b$) THEN
  RAISE EXCEPTION 'purge_account: the successor rule was not found exactly once'; END IF;
 EXECUTE replace(replace(def,$a$      WHERE m.contest_id = cid AND m.user_id <> p_user_id
        AND m.status = 'approved' AND m.role IN ('host', 'player')
        AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = m.user_id AND u.is_anonymous)
$a$,$c$      WHERE m.contest_id = cid AND m.user_id <> p_user_id
$c$),$b$      WHERE p.contest_id = cid AND p.user_id IS NOT NULL AND p.user_id <> p_user_id
        AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.user_id AND u.is_anonymous)
$b$,$d$      WHERE p.contest_id = cid AND p.user_id IS NOT NULL AND p.user_id <> p_user_id
$d$);
 IF (SELECT md5(p.prosrc) FROM pg_proc p WHERE p.oid=o) IS DISTINCT FROM '16712b9d8713a846eb83585b4e6ad714' THEN RAISE EXCEPTION 'purge_account did not end as the reviewed body'; END IF;
END $purge$;
NOTIFY pgrst, 'reload schema';
COMMIT;
