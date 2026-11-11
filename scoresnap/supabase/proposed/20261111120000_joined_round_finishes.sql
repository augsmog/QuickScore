-- Proposed only. Apply on a disposable stack until separately approved for live use.
-- The event table records the first observed completion once; later contest edits
-- and status toggles cannot move that timestamp. Activation outputs stay unchanged.
CREATE TABLE IF NOT EXISTS public.contest_finish_events (
  contest_id uuid PRIMARY KEY,
  finished_at timestamptz NOT NULL,
  source text NOT NULL CHECK (source IN ('contest_completed','published_round_ended'))
);
ALTER TABLE public.contest_finish_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.contest_finish_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.contest_finish_events TO service_role;

CREATE OR REPLACE FUNCTION public.record_contest_finish_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  finish_contest uuid;
  finish_time timestamptz;
  finish_source text;
BEGIN
  IF TG_TABLE_NAME = 'contests' THEN
    IF OLD.status IS NOT DISTINCT FROM NEW.status OR NEW.status <> 'completed' THEN
      RETURN NEW;
    END IF;
    finish_contest := NEW.id;
    finish_time := coalesce(NEW.updated_at, now());
    finish_source := 'contest_completed';
  ELSE
    IF NEW.ended_at IS NULL THEN
      RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.ended_at IS NOT NULL THEN
      RETURN NEW;
    END IF;
    finish_contest := CASE
      WHEN NEW.local_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN NEW.local_id::uuid
      ELSE NEW.contest_id
    END;
    finish_time := NEW.ended_at;
    finish_source := 'published_round_ended';
  END IF;

  INSERT INTO public.contest_finish_events(contest_id, finished_at, source)
  VALUES (finish_contest, finish_time, finish_source)
  ON CONFLICT (contest_id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.record_contest_finish_event() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS joined_finish_on_contest_complete ON public.contests;
CREATE TRIGGER joined_finish_on_contest_complete
AFTER UPDATE ON public.contests
FOR EACH ROW EXECUTE FUNCTION public.record_contest_finish_event();
DROP TRIGGER IF EXISTS joined_finish_on_published_round_end ON public.published_rounds;
CREATE TRIGGER joined_finish_on_published_round_end
AFTER INSERT OR UPDATE ON public.published_rounds
FOR EACH ROW EXECUTE FUNCTION public.record_contest_finish_event();

CREATE OR REPLACE VIEW public.joined_round_finishes AS
WITH eligible_member_finishes AS (
  SELECT m.user_id, e.finished_at, e.contest_id,
         coalesce(u.is_anonymous, false) AS is_anonymous,
         row_number() OVER (PARTITION BY m.user_id ORDER BY e.finished_at, e.contest_id) AS finish_rank
  FROM public.contest_finish_events e
  JOIN public.contests c ON c.id = e.contest_id
  JOIN public.contest_memberships m ON m.contest_id = e.contest_id
  JOIN auth.users u ON u.id = m.user_id
  WHERE m.status = 'approved'
    AND m.role IN ('player', 'scorer')
    AND m.user_id <> c.owner_id
)
SELECT user_id, finished_at AS first_joined_finish_at, contest_id, is_anonymous
FROM eligible_member_finishes
WHERE finish_rank = 1;

REVOKE ALL ON TABLE public.joined_round_finishes FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.joined_round_finishes TO service_role;
