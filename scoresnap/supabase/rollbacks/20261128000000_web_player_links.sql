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
DROP FUNCTION public.join_player_link(text,uuid);
DROP FUNCTION public.player_link_roster(text);
DROP FUNCTION public.revoke_player_links(uuid);
DROP FUNCTION public.create_player_link(uuid);
DROP FUNCTION public.player_link_contest(text);
DROP TABLE public.player_link_members;
DROP TABLE public.player_links;
NOTIFY pgrst, 'reload schema';
COMMIT;
