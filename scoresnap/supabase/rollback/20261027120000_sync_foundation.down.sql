-- Refuse destructive rollback after protocol use; export/reconcile first.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.contests WHERE protocol<>0 OR sync_enabled OR sync_revision<>0)
 OR EXISTS(SELECT 1 FROM public.contest_join_requests) OR EXISTS(SELECT 1 FROM public.contest_memberships)
 OR EXISTS(SELECT 1 FROM public.operation_receipts) OR EXISTS(SELECT 1 FROM public.score_events WHERE cell_version IS NOT NULL)
 THEN RAISE EXCEPTION 'M2_DOWN_UNSAFE'; END IF;
END $$;
DROP TRIGGER m2_publish_guard ON public.published_rounds;
DROP POLICY m2_legacy_contests ON public.contests;
DROP POLICY m2_legacy_players ON public.contest_players;
DROP POLICY m2_legacy_scores ON public.score_events;
DROP FUNCTION public.guard_sync_legacy(),public.legacy_contest_open(uuid),public.request_join(text,text),public.list_join_requests(uuid),public.decide_join_request(uuid,boolean,uuid),public.my_membership(uuid),public.write_score(uuid,uuid,uuid,integer,text,integer,bigint,uuid,text);
ALTER TABLE public.contests ALTER COLUMN invite_code DROP DEFAULT;
DROP FUNCTION public.allocate_join_code(),public.join_code_candidate();
DROP TABLE public.operation_receipts,public.contest_join_requests,public.contest_memberships;
DROP INDEX public.score_events_cell_version;
DROP INDEX public.score_events_revision;
ALTER TABLE public.score_events DROP CONSTRAINT score_events_strokes_check;
ALTER TABLE public.score_events DROP COLUMN round_id,DROP COLUMN cell_version,DROP COLUMN contest_revision,DROP COLUMN actor,DROP COLUMN op_id,DROP COLUMN request_hash,DROP COLUMN action;
ALTER TABLE public.score_events ALTER COLUMN strokes SET NOT NULL;
ALTER TABLE public.score_events ADD CONSTRAINT score_events_strokes_check CHECK (((strokes >= 1) AND (strokes <= 15)));
ALTER TABLE public.contests DROP COLUMN sync_revision,DROP COLUMN protocol,DROP COLUMN sync_enabled;
GRANT UPDATE,DELETE ON public.score_events TO anon,authenticated;
GRANT TRUNCATE,REFERENCES,TRIGGER ON public.contests,public.contest_players,public.score_events TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.is_contest_member(p_contest uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  select exists(select 1 from public.contest_players p where p.contest_id = p_contest and p.user_id = auth.uid())
      or exists(select 1 from public.contests c where c.id = p_contest and c.owner_id = auth.uid());
$function$;

ALTER FUNCTION public.calculate_retention(integer) RESET search_path;
ALTER FUNCTION public.get_dau() RESET search_path;
ALTER FUNCTION public.get_mau() RESET search_path;
ALTER FUNCTION public.handle_new_user() RESET search_path;
ALTER FUNCTION public.handle_updated_at() RESET search_path;
ALTER FUNCTION public.increment_daily_revenue(date,integer) RESET search_path;
ALTER FUNCTION public.increment_daily_signups(date) RESET search_path;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon,authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon,authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT EXECUTE ON FUNCTIONS TO PUBLIC;

ALTER TABLE public.score_events REPLICA IDENTITY DEFAULT;
