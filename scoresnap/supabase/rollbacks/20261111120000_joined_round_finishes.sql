-- Proposed only. Apply on a disposable stack until separately approved for live use.
DROP VIEW IF EXISTS public.joined_round_finishes;
DROP TRIGGER IF EXISTS joined_finish_on_contest_complete ON public.contests;
DROP TRIGGER IF EXISTS joined_finish_on_published_round_end ON public.published_rounds;
DROP FUNCTION IF EXISTS public.record_contest_finish_event();
DROP TABLE IF EXISTS public.contest_finish_events;
