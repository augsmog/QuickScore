BEGIN;
SET LOCAL ROLE postgres;
CREATE TABLE public.m2_future_fixture(id integer);
CREATE FUNCTION public.m2_future_fixture() RETURNS integer LANGUAGE sql AS 'SELECT 1';
CREATE SEQUENCE public.m2_future_sequence;
CREATE SCHEMA m2_default_scope;
CREATE FUNCTION m2_default_scope.future_function() RETURNS integer LANGUAGE sql AS 'SELECT 1';
DO $$ DECLARE r text; p text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  FOREACH p IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
   IF has_table_privilege(r,'public.m2_future_fixture',p) THEN RAISE EXCEPTION 'DEFAULT_TABLE_PRIVILEGE: % %',r,p; END IF;
  END LOOP;
  IF has_sequence_privilege(r,'public.m2_future_sequence','USAGE,SELECT,UPDATE') THEN RAISE EXCEPTION 'DEFAULT_SEQUENCE_PRIVILEGE: %',r; END IF;
  IF has_function_privilege(r,'m2_default_scope.future_function()','EXECUTE') THEN RAISE EXCEPTION 'GLOBAL_DEFAULT_FUNCTION_PRIVILEGE: %',r; END IF;
  IF has_function_privilege(r,'public.m2_future_fixture()','EXECUTE') THEN RAISE EXCEPTION 'DEFAULT_FUNCTION_PRIVILEGE: %',r; END IF;
 END LOOP;
END $$;
ROLLBACK;
