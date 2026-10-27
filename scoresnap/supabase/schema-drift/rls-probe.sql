BEGIN;
CREATE TABLE public.__m1_rls_probe (id integer);
DO $$ BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.__m1_rls_probe'::regclass) THEN
    RAISE EXCEPTION 'ensure_rls did not enable probe RLS';
  END IF;
END $$;
DROP TABLE public.__m1_rls_probe;
ROLLBACK;
