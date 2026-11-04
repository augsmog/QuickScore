-- Proposed only. Apply on a disposable stack until separately approved for live use.
CREATE TABLE public.first_round_finishes (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  finished_at timestamptz NOT NULL,
  source text NOT NULL CHECK (source IN ('contest_completed','published_round_ended')),
  contest_id uuid NOT NULL
);

ALTER TABLE public.first_round_finishes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.first_round_finishes FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.first_round_finishes TO service_role;

CREATE FUNCTION public.record_first_round_finish() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  finish_user uuid;
  finish_contest uuid;
  finish_source text;
  finish_time timestamptz;
BEGIN
  IF TG_TABLE_NAME = 'contests' THEN
    IF OLD.status IS NOT DISTINCT FROM NEW.status OR NEW.status <> 'completed' THEN
      RETURN NEW;
    END IF;
    finish_user := NEW.owner_id;
    finish_contest := NEW.id;
    finish_source := 'contest_completed';
    finish_time := coalesce(NEW.updated_at, now());
  ELSE
    IF NEW.ended_at IS NULL OR (TG_OP = 'UPDATE' AND OLD.ended_at IS NOT NULL) THEN
      RETURN NEW;
    END IF;
    finish_user := NEW.owner_id;
    finish_contest := NEW.contest_id;
    finish_source := 'published_round_ended';
    finish_time := NEW.ended_at;
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users u WHERE u.id=finish_user AND NOT coalesce(u.is_anonymous,false)) THEN
    INSERT INTO public.first_round_finishes(user_id,finished_at,source,contest_id)
    VALUES (finish_user,finish_time,finish_source,finish_contest)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.record_first_round_finish() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER first_round_finish_on_contest_complete
AFTER UPDATE ON public.contests
FOR EACH ROW EXECUTE FUNCTION public.record_first_round_finish();

CREATE TRIGGER first_round_finish_on_published_round_end
AFTER INSERT OR UPDATE ON public.published_rounds
FOR EACH ROW EXECUTE FUNCTION public.record_first_round_finish();

CREATE VIEW public.activation_daily AS
WITH daily_signups AS (
  SELECT (u.created_at AT TIME ZONE 'UTC')::date AS date, count(*)::integer AS signups
  FROM auth.users u
  WHERE NOT coalesce(u.is_anonymous,false)
  GROUP BY 1
), daily_finishes AS (
  SELECT (f.finished_at AT TIME ZONE 'UTC')::date AS date, count(*)::integer AS first_round_finished
  FROM public.first_round_finishes f
  GROUP BY 1
), daily AS (
  SELECT coalesce(s.date,f.date) AS date, coalesce(s.signups,0) AS signups,
         coalesce(f.first_round_finished,0) AS first_round_finished
  FROM daily_signups s FULL OUTER JOIN daily_finishes f USING (date)
)
SELECT date, signups, first_round_finished,
       first_round_finished::numeric / nullif(signups,0) AS activation_rate
FROM daily;
REVOKE ALL ON TABLE public.activation_daily FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.activation_daily TO service_role;
