DROP VIEW IF EXISTS public.activation_daily;
DROP TRIGGER IF EXISTS first_round_finish_on_published_round_end ON public.published_rounds;
DROP TRIGGER IF EXISTS first_round_finish_on_contest_complete ON public.contests;
DROP FUNCTION IF EXISTS public.record_first_round_finish();
DROP TABLE IF EXISTS public.first_round_finishes;
