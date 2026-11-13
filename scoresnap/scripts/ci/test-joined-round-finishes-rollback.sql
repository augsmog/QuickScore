-- Disposable local Supabase stack only. Run after the proposed migration rollback.
DO $$ BEGIN
  IF to_regclass('public.joined_round_finishes') IS NOT NULL THEN
    RAISE EXCEPTION 'rollback left joined_round_finishes view';
  END IF;
  IF to_regclass('public.contest_finish_events') IS NOT NULL THEN
    RAISE EXCEPTION 'rollback left contest_finish_events table';
  END IF;
  IF to_regprocedure('public.record_contest_finish_event()') IS NOT NULL THEN
    RAISE EXCEPTION 'rollback left record_contest_finish_event function';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger
      WHERE tgname IN ('joined_finish_on_contest_complete','joined_finish_on_published_round_end')
        AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'rollback left joined finish triggers';
  END IF;
END $$;
SELECT 'PASS: joined-round rollback removes view, table, function, and triggers';
