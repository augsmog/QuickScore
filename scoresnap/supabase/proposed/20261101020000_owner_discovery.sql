-- REQUIRES LIVE MIGRATION APPROVAL. Proposal only; never auto-applied to live.
-- m2_legacy_contests hides protocol-1 rows from every direct table SELECT.
-- Keep that legacy boundary intact. Return only the current ordinary owner's IDs.
BEGIN;
CREATE FUNCTION public.list_owned_contests(code text DEFAULT NULL) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id) ORDER BY c.id), '[]'::jsonb)
 FROM public.contests c
 WHERE auth.uid() IS NOT NULL
 AND NOT coalesce((auth.jwt()->>'is_anonymous')::boolean, false)
 AND c.owner_id=auth.uid() AND c.protocol=1
 AND ($1 IS NULL OR c.invite_code=upper(btrim($1)));
$$;
REVOKE ALL ON FUNCTION public.list_owned_contests(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_owned_contests(text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
