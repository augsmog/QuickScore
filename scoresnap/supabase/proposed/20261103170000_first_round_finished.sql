-- Proposed only. Apply on a disposable stack until separately approved for live use.
CREATE TABLE public.first_round_finishes (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  finished_at timestamptz NOT NULL,
  source text NOT NULL CHECK (source IN ('contest_completed','published_round_ended','quick_settle')),
  contest_id uuid NOT NULL
);

ALTER TABLE public.first_round_finishes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.first_round_finishes FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.first_round_finishes TO service_role;

-- A local Quick Settle contest is not published/shared, so its authenticated owner
-- reports completion through this narrow, idempotent operation RPC instead.
CREATE TABLE public.quick_settle_completion_operations (
  operation_id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contest_id uuid NOT NULL,
  acknowledged_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.quick_settle_completion_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.quick_settle_completion_operations FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.record_quick_settle_completion(p_operation_id uuid, p_owner_id uuid, p_contest_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  request_owner uuid := auth.uid();
  existing_owner uuid;
  existing_contest uuid;
BEGIN
  IF request_owner IS NULL OR p_owner_id IS DISTINCT FROM request_owner OR p_operation_id IS NULL OR p_contest_id IS NULL THEN
    RAISE EXCEPTION 'Quick Settle completion owner or operation is invalid' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id=request_owner AND NOT coalesce(u.is_anonymous,false)) THEN
    RAISE EXCEPTION 'Quick Settle completion requires a registered account' USING ERRCODE = '42501';
  END IF;

  SELECT owner_id, contest_id INTO existing_owner, existing_contest
    FROM public.quick_settle_completion_operations WHERE operation_id=p_operation_id FOR UPDATE;
  IF FOUND AND (existing_owner IS DISTINCT FROM request_owner OR existing_contest IS DISTINCT FROM p_contest_id) THEN
    RAISE EXCEPTION 'Quick Settle operation ID was already used for another owner or contest' USING ERRCODE = '23505';
  END IF;
  IF NOT FOUND THEN
    INSERT INTO public.quick_settle_completion_operations(operation_id,owner_id,contest_id)
      VALUES (p_operation_id,request_owner,p_contest_id);
  END IF;

  INSERT INTO public.first_round_finishes(user_id,finished_at,source,contest_id)
    VALUES (request_owner,now(),'quick_settle',p_contest_id)
    ON CONFLICT (user_id) DO NOTHING;
  RETURN jsonb_build_object('operationId',p_operation_id,'ownerId',request_owner);
END;
$$;
REVOKE ALL ON FUNCTION public.record_quick_settle_completion(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_quick_settle_completion(uuid,uuid,uuid) TO authenticated;

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
