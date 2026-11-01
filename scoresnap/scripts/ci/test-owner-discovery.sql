-- Disposable stack only; fixture rows and claims are rolled back.
BEGIN;
INSERT INTO auth.users(id) VALUES ('00000000-0000-0000-0000-000000000081'), ('00000000-0000-0000-0000-000000000082');
INSERT INTO public.contests(id,owner_id,course,protocol,sync_enabled,invite_code) VALUES
 ('00000000-0000-0000-0000-000000000091','00000000-0000-0000-0000-000000000081','{}',1,true,'OWN234'),
 ('00000000-0000-0000-0000-000000000092','00000000-0000-0000-0000-000000000082','{}',1,true,'ELSE23');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000081","role":"authenticated","is_anonymous":false}',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.contests WHERE protocol=1) THEN RAISE EXCEPTION 'legacy RLS unexpectedly exposes protocol-1 rows'; END IF;
 IF public.list_owned_contests() <> '[{"id":"00000000-0000-0000-0000-000000000091"}]'::jsonb THEN RAISE EXCEPTION 'owner enumeration failed'; END IF;
 IF public.list_owned_contests(' own234 ') <> public.list_owned_contests() THEN RAISE EXCEPTION 'normalized own code failed'; END IF;
 IF public.list_owned_contests('ELSE23') <> '[]'::jsonb THEN RAISE EXCEPTION 'foreign code leaked'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000081","role":"authenticated","is_anonymous":true}',true);
DO $$ BEGIN
 IF public.list_owned_contests() <> '[]'::jsonb THEN RAISE EXCEPTION 'anonymous owner leaked'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{}',true);
DO $$ BEGIN
 IF public.list_owned_contests() <> '[]'::jsonb THEN RAISE EXCEPTION 'missing identity leaked'; END IF;
 IF has_function_privilege('anon','public.list_owned_contests(text)','EXECUTE') THEN RAISE EXCEPTION 'anon RPC grant'; END IF;
END $$;
ROLLBACK;
