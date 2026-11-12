BEGIN;
DO $$ BEGIN
 IF (SELECT relreplident FROM pg_class WHERE oid='public.score_events'::regclass)<>'f' THEN RAISE EXCEPTION 'score_events realtime old-row identity'; END IF;
 IF (SELECT count(*) FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename IN ('contests','contest_players','score_events'))<>3 THEN RAISE EXCEPTION 'realtime publication members'; END IF;
END $$;
CREATE FUNCTION pg_temp.assert(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERT: %',label; END IF; END $$;
GRANT EXECUTE ON FUNCTION pg_temp.assert(boolean,text) TO anon,authenticated;
DO $$ DECLARE r text; t text; p text; f record; intended boolean; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  FOREACH t IN ARRAY ARRAY['contest_memberships','contest_join_requests','operation_receipts'] LOOP
   FOREACH p IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
    PERFORM pg_temp.assert(NOT has_table_privilege(r,'public.'||t,p),r||' '||t||' '||p);
   END LOOP;
  END LOOP;
  PERFORM pg_temp.assert(NOT has_table_privilege(r,'public.score_events','UPDATE'),'event UPDATE revoked');
  PERFORM pg_temp.assert(NOT has_table_privilege(r,'public.score_events','DELETE'),'event DELETE revoked');
  FOR f IN SELECT oid,proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN
   ('join_code_candidate','allocate_join_code','guard_sync_legacy','legacy_contest_open','request_join','list_join_requests','decide_join_request','my_membership','write_score') LOOP
   intended := r='authenticated' AND f.proname NOT IN ('join_code_candidate','allocate_join_code','guard_sync_legacy');
   PERFORM pg_temp.assert(has_function_privilege(r,f.oid,'EXECUTE')=intended,r||' '||f.proname);
  END LOOP;
 END LOOP;
 PERFORM pg_temp.assert((SELECT bool_and(relrowsecurity AND relforcerowsecurity) FROM pg_class WHERE oid IN
 ('public.contest_memberships'::regclass,'public.contest_join_requests'::regclass,'public.operation_receipts'::regclass)),'forced RLS');
END $$;
INSERT INTO auth.users(id) VALUES ('10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002'),('10000000-0000-0000-0000-000000000003'),('10000000-0000-0000-0000-000000000004');
INSERT INTO public.contests(id,owner_id,course,protocol,sync_enabled,invite_code) VALUES
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','{}',1,true,'ABCDEF');
INSERT INTO public.contest_players(id,contest_id,name) VALUES ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Player');
SELECT pg_temp.assert(public.allocate_join_code() ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$','code alphabet');
-- Replace randomness transactionally to force a real existing-code collision then success.
CREATE SEQUENCE public.m2_collision_seq;
CREATE OR REPLACE FUNCTION public.join_code_candidate() RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT CASE WHEN nextval('public.m2_collision_seq')=1 THEN 'ABCDEF' ELSE 'GHJKLM' END $$;
SELECT pg_temp.assert(public.allocate_join_code()='GHJKLM','code collision retries');
CREATE OR REPLACE FUNCTION public.join_code_candidate() RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT 'ABCDEF'::text $$;
DO $$ BEGIN BEGIN PERFORM public.allocate_join_code(); RAISE EXCEPTION 'unbounded collision retry'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'CODE_EXHAUSTED' THEN RAISE; END IF; END; END $$;
-- The replacement is rolled back with the fixture, never part of expected catalog.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated","is_anonymous":true}';
SELECT pg_temp.assert(public.request_join('ABCDEF','Guest')='{"status":"pending"}'::jsonb,'generic pending');
SELECT pg_temp.assert(public.my_membership('20000000-0000-0000-0000-000000000001') IS NULL,'request alone grants no membership');
DO $$ BEGIN IF coalesce(current_setting('m2.single_user',true),'off')='on' THEN RAISE NOTICE 'SKIP raw row filtering: single-user mode; required in CI'; ELSE PERFORM pg_temp.assert((SELECT count(*)=0 FROM public.contests),'pending has no raw contest data'); END IF; END $$;
SELECT pg_temp.assert(public.request_join('BADBAD','Guest')='{"status":"pending"}'::jsonb,'generic unknown');
DO $$ BEGIN
 BEGIN PERFORM public.list_join_requests('20000000-0000-0000-0000-000000000001'); RAISE EXCEPTION 'pending listed roster'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.write_score('20000000-0000-0000-0000-000000000001',NULL,'30000000-0000-0000-0000-000000000001',1,'set',4,0,'40000000-0000-0000-0000-000000000001','a'); RAISE EXCEPTION 'pending wrote'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SET LOCAL request.jwt.claims='{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":true}';
DO $$ BEGIN BEGIN PERFORM public.list_join_requests('20000000-0000-0000-0000-000000000001'); RAISE EXCEPTION 'anonymous host accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;
SET LOCAL request.jwt.claims='{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":false}';
SELECT public.decide_join_request((public.list_join_requests('20000000-0000-0000-0000-000000000001')->0->>'id')::uuid,true,'30000000-0000-0000-0000-000000000001');
SET LOCAL request.jwt.claims='{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated","is_anonymous":true}';
SELECT pg_temp.assert(public.my_membership('20000000-0000-0000-0000-000000000001')->>'status'='approved','approved player');
SELECT pg_temp.assert(public.write_score('20000000-0000-0000-0000-000000000001',NULL,'30000000-0000-0000-0000-000000000001',1,'set',4,0,'40000000-0000-0000-0000-000000000001','a')->>'status'='accepted','first write');
SELECT pg_temp.assert(public.write_score('20000000-0000-0000-0000-000000000001',NULL,'30000000-0000-0000-0000-000000000001',1,'set',4,0,'40000000-0000-0000-0000-000000000001','a')->>'version'='1','replay');
SELECT pg_temp.assert(public.write_score('20000000-0000-0000-0000-000000000001',NULL,'30000000-0000-0000-0000-000000000001',1,'set',5,0,'40000000-0000-0000-0000-000000000002','b')->>'status'='conflict','CAS conflict');
DO $$ BEGIN
 BEGIN PERFORM public.write_score('20000000-0000-0000-0000-000000000001',NULL,'30000000-0000-0000-0000-000000000001',1,'set',5,0,'40000000-0000-0000-0000-000000000001','a'); RAISE EXCEPTION 'changed payload accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.write_score('20000000-0000-0000-0000-000000000001',NULL,'30000000-0000-0000-0000-000000000001',1,'set',0,1,'40000000-0000-0000-0000-000000000003','c'); RAISE EXCEPTION 'zero accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
SELECT pg_temp.assert(public.write_score('20000000-0000-0000-0000-000000000001',NULL,'30000000-0000-0000-0000-000000000001',1,'clear',NULL,1,'40000000-0000-0000-0000-000000000004','d')->>'version'='2','clear tombstone');
-- Approved identities cannot self-approve, write foreign cells, or use raw tables.
DO $$ BEGIN
 BEGIN PERFORM 1 FROM public.contest_memberships; RAISE EXCEPTION 'raw membership read'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.write_score('20000000-0000-0000-0000-000000000001',NULL,'30000000-0000-0000-0000-000000000002',1,'set',4,0,'40000000-0000-0000-0000-000000000006','x'); RAISE EXCEPTION 'foreign player accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT public.request_join('ABCDEF','Duplicate');
SET LOCAL request.jwt.claims='{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":false}';
DO $$ BEGIN BEGIN
 PERFORM public.decide_join_request((SELECT x->>'id' FROM jsonb_array_elements(public.list_join_requests('20000000-0000-0000-0000-000000000001')) x WHERE x->>'status'='pending')::uuid,true,'30000000-0000-0000-0000-000000000001');
 RAISE EXCEPTION 'duplicate approved claim'; EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;
RESET ROLE;
UPDATE public.contest_join_requests SET status='rejected' WHERE status='pending';
DO $$ BEGIN BEGIN
 INSERT INTO public.contest_memberships(contest_id,user_id,role,player_id,status) VALUES('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004','player','30000000-0000-0000-0000-000000000001','approved');
 RAISE EXCEPTION 'duplicate slot constraint'; EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":true}';
DO $$ BEGIN BEGIN
 PERFORM public.write_score('20000000-0000-0000-0000-000000000001',NULL,'30000000-0000-0000-0000-000000000001',2,'set',4,0,'40000000-0000-0000-0000-000000000007','x');
 RAISE EXCEPTION 'anonymous host write'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SET LOCAL request.jwt.claims='{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":false}';
SELECT pg_temp.assert(public.write_score('20000000-0000-0000-0000-000000000001',NULL,'30000000-0000-0000-0000-000000000001',2,'set',3,0,'40000000-0000-0000-0000-000000000008','host')->>'status'='accepted','non-anon host write');

-- A second identity consents; host transfers the stable slot.
SET LOCAL request.jwt.claims='{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated","is_anonymous":true}';
SELECT public.request_join('ABCDEF','Replacement');
RESET ROLE;
UPDATE public.contest_players SET user_id='10000000-0000-0000-0000-000000000002' WHERE id='30000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":false}';
SELECT public.decide_join_request((SELECT x->>'id' FROM jsonb_array_elements(public.list_join_requests('20000000-0000-0000-0000-000000000001')) x WHERE x->>'status'='pending')::uuid,true,'30000000-0000-0000-0000-000000000001');
SET LOCAL request.jwt.claims='{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated","is_anonymous":true}';
SELECT pg_temp.assert(NOT public.is_contest_member('20000000-0000-0000-0000-000000000001'),'legacy member revoked');
DO $$ BEGIN BEGIN PERFORM public.write_score('20000000-0000-0000-0000-000000000001',NULL,'30000000-0000-0000-0000-000000000001',1,'set',4,0,'40000000-0000-0000-0000-000000000001','a'); RAISE EXCEPTION 'revoked replay'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;
SET LOCAL request.jwt.claims='{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated","is_anonymous":false}';
DO $$ BEGIN BEGIN PERFORM public.write_score('20000000-0000-0000-0000-000000000001',NULL,'30000000-0000-0000-0000-000000000001',1,'set',4,0,'40000000-0000-0000-0000-000000000005','a'); RAISE EXCEPTION 'outsider write'; EXCEPTION WHEN insufficient_privilege THEN NULL; END; END $$;
RESET ROLE;
SELECT pg_temp.assert((SELECT count(*)=3 FROM public.score_events WHERE contest_id='20000000-0000-0000-0000-000000000001'),'one event per accepted operation');
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM public.contest_players WHERE user_id='10000000-0000-0000-0000-000000000002'),'legacy bindings cleared');
ROLLBACK;
