-- REQUIRES LIVE MIGRATION APPROVAL. Proposal only; never auto-applied to live.
--
-- RPC-only rollout of Quick Settle completion (AUG-1585). The app calls
-- public.record_quick_settle_completion after a quick settle; production has no such function.
--
-- This is the RPC half of 20261103170000_first_round_finished.sql with one correction, and
-- WITHOUT that file's triggers on public.contests / public.published_rounds and without the
-- activation_daily view. Those stay unapplied until they have their own review: a trigger on
-- contests runs inside every contest update, so a failure in the telemetry insert would roll
-- back a user's round-completion write.
--
-- The correction (review hold, Nov 27 2026): the earlier body locked the operation row with
-- SELECT ... FOR UPDATE and inserted it only if absent. A row that does not exist yet cannot be
-- locked, so two identical concurrent requests both saw "absent", both inserted, and the second
-- failed with a unique-key error instead of returning the same acknowledgment. The INSERT now
-- arbitrates the operation ID atomically (ON CONFLICT DO NOTHING waits for a concurrent insert
-- of the same key to commit or roll back), and the stored owner and contest are compared after.
BEGIN;

CREATE TABLE public.first_round_finishes (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  finished_at timestamptz NOT NULL,
  source text NOT NULL CHECK (source IN ('contest_completed','published_round_ended','quick_settle')),
  contest_id uuid NOT NULL
);
ALTER TABLE public.first_round_finishes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.first_round_finishes FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.first_round_finishes TO service_role;

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
  stored_owner uuid;
  stored_contest uuid;
BEGIN
  IF request_owner IS NULL OR p_owner_id IS DISTINCT FROM request_owner OR p_operation_id IS NULL OR p_contest_id IS NULL THEN
    RAISE EXCEPTION 'Quick Settle completion owner or operation is invalid' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id=request_owner AND NOT coalesce(u.is_anonymous,false)) THEN
    RAISE EXCEPTION 'Quick Settle completion requires a registered account' USING ERRCODE = '42501';
  END IF;

  -- The insert decides who owns this operation ID. A concurrent insert of the same ID makes this
  -- statement wait; once that one commits, this one does nothing and the row below is theirs.
  INSERT INTO public.quick_settle_completion_operations(operation_id,owner_id,contest_id)
    VALUES (p_operation_id,request_owner,p_contest_id)
    ON CONFLICT (operation_id) DO NOTHING;

  SELECT owner_id, contest_id INTO stored_owner, stored_contest
    FROM public.quick_settle_completion_operations WHERE operation_id=p_operation_id;
  IF NOT FOUND OR stored_owner IS DISTINCT FROM request_owner OR stored_contest IS DISTINCT FROM p_contest_id THEN
    RAISE EXCEPTION 'Quick Settle operation ID was already used for another owner or contest' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.first_round_finishes(user_id,finished_at,source,contest_id)
    VALUES (request_owner,now(),'quick_settle',p_contest_id)
    ON CONFLICT (user_id) DO NOTHING;
  RETURN jsonb_build_object('operationId',p_operation_id,'ownerId',request_owner);
END;
$$;
REVOKE ALL ON FUNCTION public.record_quick_settle_completion(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_quick_settle_completion(uuid,uuid,uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
