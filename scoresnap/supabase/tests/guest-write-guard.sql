BEGIN;
-- Each call's exception block is a subtransaction; explicit savepoints also
-- isolate successful writes. UPDATE may correctly filter all rows under RLS.
-- Sequence increments survive the per-probe SAVEPOINT rollback.
CREATE TEMP SEQUENCE probe_failures MINVALUE 0 START 0;
SELECT setval('pg_temp.probe_failures',0,true);
GRANT USAGE, SELECT ON SEQUENCE probe_failures TO authenticated, anon;
CREATE FUNCTION pg_temp.probe(sql text, denied boolean, label text, filtered boolean DEFAULT false) RETURNS void LANGUAGE plpgsql AS $$
DECLARE n bigint; failure text;
BEGIN
 BEGIN
  EXECUTE sql; GET DIAGNOSTICS n=ROW_COUNT;
  IF NOT denied AND (sql LIKE 'UPDATE %' OR sql LIKE 'DELETE %') AND n=0 THEN
   failure := 'M2B_EXPECTED_UPDATE: ' || label;
  ELSIF denied AND NOT (filtered AND n=0) THEN
   failure := 'M2B_UNGUARDED: ' || label;
  END IF;
  IF failure IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='PZ001', MESSAGE=failure; END IF;
 EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE = 'PZ001' THEN NULL;
  ELSIF SQLSTATE <> '42501' OR NOT denied THEN
   failure := format('M2B_UNEXPECTED_SQLSTATE: %s SQLSTATE=%s %s',label,SQLSTATE,SQLERRM);
  END IF;
 END;
 IF failure IS NOT NULL THEN
  PERFORM nextval('pg_temp.probe_failures');
  RAISE WARNING '%',failure;
 END IF;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.probe(text,boolean,text,boolean) TO authenticated,anon;
INSERT INTO auth.users(id) VALUES('20000000-0000-0000-0000-000000000001'),('20000000-0000-0000-0000-000000000002');
INSERT INTO public.contests(id,owner_id,course,invite_code) VALUES('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','{}','M2BG01'),('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','{}','M2BG02');
INSERT INTO public.contest_players(id,contest_id,user_id,name) VALUES('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Guest');
INSERT INTO public.score_events(contest_id,player_id,entered_by,hole,strokes) VALUES('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',1,4);
INSERT INTO public.contests(id,owner_id,course,invite_code) VALUES('30000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','{}','M2BG03');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":true}',true);
SAVEPOINT one;
SELECT pg_temp.probe($q$INSERT INTO public.contests(owner_id,course,invite_code) VALUES('20000000-0000-0000-0000-000000000001','{}','M2BNEW')$q$, true, 'guest contest', false);
ROLLBACK TO one;
RELEASE one;
SAVEPOINT one;
SELECT pg_temp.probe($q$INSERT INTO public.contest_players(contest_id,user_id,name) VALUES('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','Self')$q$, true, 'guest other join', false);
ROLLBACK TO one;
RELEASE one;
SAVEPOINT one;
SELECT pg_temp.probe($q$INSERT INTO public.contest_players(contest_id,user_id,name) VALUES('30000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','Own')$q$, true, 'guest owner join', false);
ROLLBACK TO one;
RELEASE one;
SAVEPOINT one;
SELECT pg_temp.probe($q$INSERT INTO public.score_events(contest_id,player_id,entered_by,hole,strokes) VALUES('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',2,4)$q$, true, 'guest score', false);
ROLLBACK TO one;
RELEASE one;
SAVEPOINT one;
SELECT pg_temp.probe($q$INSERT INTO public.scans(user_id) VALUES('20000000-0000-0000-0000-000000000001')$q$, true, 'guest scan', false);
ROLLBACK TO one;
RELEASE one;
SAVEPOINT one;
SELECT pg_temp.probe($q$UPDATE public.profiles SET display_name='Guest'$q$, true, 'guest profile', true);
ROLLBACK TO one;
RELEASE one;
SAVEPOINT one;
SELECT pg_temp.probe($q$UPDATE public.profiles SET is_premium=true$q$, true, 'guest premium', false);
ROLLBACK TO one;
RELEASE one;
SAVEPOINT one;
SELECT pg_temp.probe($q$UPDATE public.score_events SET strokes=5$q$, true, 'guest append only', false);
ROLLBACK TO one;
RELEASE one;
SAVEPOINT one;
SELECT pg_temp.probe($q$DELETE FROM public.score_events$q$, true, 'guest append only', false);
ROLLBACK TO one;
RELEASE one;
RESET ROLE;
UPDATE public.contests SET protocol=1,sync_enabled=true WHERE id='30000000-0000-0000-0000-000000000002';
SET LOCAL ROLE authenticated;
SAVEPOINT one;
SELECT pg_temp.probe($q$DO $$ BEGIN IF public.request_join('M2BG02','Guest')->>'status'<>'pending' THEN RAISE EXCEPTION 'join'; END IF; END $$$q$, false, 'guest RPC join', false);
ROLLBACK TO one;
RELEASE one;
SAVEPOINT one;
SELECT pg_temp.probe($q$SELECT public.list_join_requests('30000000-0000-0000-0000-000000000002')$q$, true, 'guest host RPC', false);
ROLLBACK TO one;
RELEASE one;
SELECT public.request_join('M2BG02','Guest');
RESET ROLE;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.contest_join_requests WHERE requester='20000000-0000-0000-0000-000000000001') THEN RAISE EXCEPTION 'request not persisted'; END IF; END $$;
UPDATE public.contests SET protocol=0,sync_enabled=false WHERE invite_code='M2BG02';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":false}',true);
SAVEPOINT one;
SELECT pg_temp.probe($q$INSERT INTO public.contests(owner_id,course,invite_code) VALUES('20000000-0000-0000-0000-000000000001','{}','M2BNEW')$q$, false, 'regular guest contest', false);
ROLLBACK TO one;
RELEASE one;
SAVEPOINT one;
SELECT pg_temp.probe($q$INSERT INTO public.contest_players(contest_id,user_id,name) VALUES('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','Self')$q$, false, 'regular guest other join', false);
ROLLBACK TO one;
RELEASE one;
SAVEPOINT one;
SELECT pg_temp.probe($q$INSERT INTO public.contest_players(contest_id,user_id,name) VALUES('30000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','Own')$q$, false, 'regular guest owner join', false);
ROLLBACK TO one;
RELEASE one;
SAVEPOINT one;
SELECT pg_temp.probe($q$INSERT INTO public.score_events(contest_id,player_id,entered_by,hole,strokes) VALUES('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',2,4)$q$, false, 'regular guest score', false);
ROLLBACK TO one;
RELEASE one;
SAVEPOINT one;
SELECT pg_temp.probe($q$INSERT INTO public.scans(user_id) VALUES('20000000-0000-0000-0000-000000000001')$q$, false, 'regular guest scan', false);
ROLLBACK TO one;
RELEASE one;
SAVEPOINT one;
SELECT pg_temp.probe($q$UPDATE public.profiles SET display_name='Regular'$q$, false, 'regular display', false);
ROLLBACK TO one;
RELEASE one;
SAVEPOINT one;
SELECT pg_temp.probe($q$UPDATE public.profiles SET is_premium=true$q$, true, 'regular entitlement is_premium', false);
ROLLBACK TO one;
RELEASE one;
SAVEPOINT one;
SELECT pg_temp.probe($q$UPDATE public.profiles SET premium_since=now()$q$, true, 'regular entitlement premium_since', false);
ROLLBACK TO one;
RELEASE one;
SAVEPOINT one;
SELECT pg_temp.probe($q$UPDATE public.profiles SET premium_source='forged'$q$, true, 'regular entitlement premium_source', false);
ROLLBACK TO one;
RELEASE one;
SAVEPOINT one;
SELECT pg_temp.probe($q$UPDATE public.profiles SET churned_at=now()$q$, true, 'regular entitlement churned_at', false);
ROLLBACK TO one;
RELEASE one;
SAVEPOINT one;
SELECT pg_temp.probe($q$UPDATE public.profiles SET referral_count=999$q$, true, 'regular entitlement referral_count', false);
ROLLBACK TO one;
RELEASE one;
SAVEPOINT one;
SELECT pg_temp.probe($q$UPDATE public.profiles SET referral_code='forged'$q$, true, 'regular entitlement referral_code', false);
ROLLBACK TO one;
RELEASE one;
SAVEPOINT one;
SELECT pg_temp.probe($q$UPDATE public.profiles SET referred_by='forged'$q$, true, 'regular entitlement referred_by', false);
ROLLBACK TO one;
RELEASE one;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims','{}',true);
SAVEPOINT one;
SELECT pg_temp.probe($q$INSERT INTO public.contests(owner_id,course,invite_code) VALUES('20000000-0000-0000-0000-000000000001','{}','M2BNEW')$q$, true, 'anon guest contest', true);
ROLLBACK TO one;
RELEASE one;
SAVEPOINT one;
SELECT pg_temp.probe($q$INSERT INTO public.contest_players(contest_id,user_id,name) VALUES('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','Self')$q$, true, 'anon guest other join', true);
ROLLBACK TO one;
RELEASE one;
SAVEPOINT one;
SELECT pg_temp.probe($q$INSERT INTO public.contest_players(contest_id,user_id,name) VALUES('30000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','Own')$q$, true, 'anon guest owner join', true);
ROLLBACK TO one;
RELEASE one;
SAVEPOINT one;
SELECT pg_temp.probe($q$INSERT INTO public.score_events(contest_id,player_id,entered_by,hole,strokes) VALUES('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',2,4)$q$, true, 'anon guest score', true);
ROLLBACK TO one;
RELEASE one;
SAVEPOINT one;
SELECT pg_temp.probe($q$INSERT INTO public.scans(user_id) VALUES('20000000-0000-0000-0000-000000000001')$q$, true, 'anon guest scan', true);
ROLLBACK TO one;
RELEASE one;
SAVEPOINT one;
SELECT pg_temp.probe($q$DELETE FROM public.contests$q$, true, 'anon contests', true);
ROLLBACK TO one;
RELEASE one;
SAVEPOINT one;
SELECT pg_temp.probe($q$UPDATE public.contests SET id=id$q$, true, 'anon contests', true);
ROLLBACK TO one;
RELEASE one;
SAVEPOINT one;
SELECT pg_temp.probe($q$DELETE FROM public.contest_players$q$, true, 'anon contest_players', true);
ROLLBACK TO one;
RELEASE one;
SAVEPOINT one;
SELECT pg_temp.probe($q$UPDATE public.contest_players SET id=id$q$, true, 'anon contest_players', true);
ROLLBACK TO one;
RELEASE one;
SAVEPOINT one;
SELECT pg_temp.probe($q$DELETE FROM public.score_events$q$, true, 'anon score_events', true);
ROLLBACK TO one;
RELEASE one;
SAVEPOINT one;
SELECT pg_temp.probe($q$UPDATE public.score_events SET id=id$q$, true, 'anon score_events', true);
ROLLBACK TO one;
RELEASE one;
SAVEPOINT one;
SELECT pg_temp.probe($q$DELETE FROM public.scans$q$, true, 'anon scans', true);
ROLLBACK TO one;
RELEASE one;
SAVEPOINT one;
SELECT pg_temp.probe($q$UPDATE public.scans SET id=id$q$, true, 'anon scans', true);
ROLLBACK TO one;
RELEASE one;
SAVEPOINT one;
SELECT pg_temp.probe($q$DELETE FROM public.profiles$q$, true, 'anon profiles', true);
ROLLBACK TO one;
RELEASE one;
SAVEPOINT one;
SELECT pg_temp.probe($q$UPDATE public.profiles SET id=id$q$, true, 'anon profiles', true);
ROLLBACK TO one;
RELEASE one;

RESET ROLE;
INSERT INTO public.scans(id,user_id) VALUES ('50000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001');
INSERT INTO public.profiles(id) VALUES ('20000000-0000-0000-0000-000000000001') ON CONFLICT (id) DO NOTHING;
RESET ROLE; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', '{"sub": "20000000-0000-0000-0000-000000000001", "role": "authenticated", "is_anonymous": true}', true);

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$INSERT INTO public.contests(owner_id,course,invite_code) VALUES('20000000-0000-0000-0000-000000000001','{}','M2BNEW')$q$, true, 'guest contests insert matrix', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

RESET ROLE; CREATE TEMP TABLE before_row AS SELECT * FROM public.contests WHERE id='30000000-0000-0000-0000-000000000001'; SET LOCAL ROLE authenticated;
SELECT pg_temp.probe($q$UPDATE public.contests SET name='Changed',current_hole=2 WHERE id='30000000-0000-0000-0000-000000000001'$q$, true, 'guest contests UPDATE', true);
RESET ROLE; DO $$ BEGIN IF EXISTS ((TABLE before_row EXCEPT SELECT * FROM public.contests WHERE id='30000000-0000-0000-0000-000000000001') UNION ALL (SELECT * FROM public.contests WHERE id='30000000-0000-0000-0000-000000000001' EXCEPT TABLE before_row)) THEN RAISE EXCEPTION 'M2B_ROW_CHANGED: guest contests UPDATE'; END IF; END $$; SET LOCAL ROLE authenticated;
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

RESET ROLE; CREATE TEMP TABLE before_row AS SELECT * FROM public.contests WHERE id='30000000-0000-0000-0000-000000000001'; SET LOCAL ROLE authenticated;
SELECT pg_temp.probe($q$DELETE FROM public.contests WHERE id='30000000-0000-0000-0000-000000000001'$q$, true, 'guest contests DELETE', true);
RESET ROLE; DO $$ BEGIN IF EXISTS ((TABLE before_row EXCEPT SELECT * FROM public.contests WHERE id='30000000-0000-0000-0000-000000000001') UNION ALL (SELECT * FROM public.contests WHERE id='30000000-0000-0000-0000-000000000001' EXCEPT TABLE before_row)) THEN RAISE EXCEPTION 'M2B_ROW_CHANGED: guest contests DELETE'; END IF; END $$; SET LOCAL ROLE authenticated;
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$INSERT INTO public.contest_players(contest_id,user_id,name) VALUES('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Own')$q$, true, 'guest contest_players insert matrix', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

RESET ROLE; CREATE TEMP TABLE before_row AS SELECT * FROM public.contest_players WHERE id='40000000-0000-0000-0000-000000000001'; SET LOCAL ROLE authenticated;
SELECT pg_temp.probe($q$UPDATE public.contest_players SET name='Changed',handicap=12,group_id='group-2' WHERE id='40000000-0000-0000-0000-000000000001'$q$, true, 'guest contest_players UPDATE', true);
RESET ROLE; DO $$ BEGIN IF EXISTS ((TABLE before_row EXCEPT SELECT * FROM public.contest_players WHERE id='40000000-0000-0000-0000-000000000001') UNION ALL (SELECT * FROM public.contest_players WHERE id='40000000-0000-0000-0000-000000000001' EXCEPT TABLE before_row)) THEN RAISE EXCEPTION 'M2B_ROW_CHANGED: guest contest_players UPDATE'; END IF; END $$; SET LOCAL ROLE authenticated;
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

RESET ROLE; CREATE TEMP TABLE before_row AS SELECT * FROM public.contest_players WHERE id='40000000-0000-0000-0000-000000000001'; SET LOCAL ROLE authenticated;
SELECT pg_temp.probe($q$DELETE FROM public.contest_players WHERE id='40000000-0000-0000-0000-000000000001'$q$, true, 'guest contest_players DELETE', true);
RESET ROLE; DO $$ BEGIN IF EXISTS ((TABLE before_row EXCEPT SELECT * FROM public.contest_players WHERE id='40000000-0000-0000-0000-000000000001') UNION ALL (SELECT * FROM public.contest_players WHERE id='40000000-0000-0000-0000-000000000001' EXCEPT TABLE before_row)) THEN RAISE EXCEPTION 'M2B_ROW_CHANGED: guest contest_players DELETE'; END IF; END $$; SET LOCAL ROLE authenticated;
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$INSERT INTO public.score_events(contest_id,player_id,entered_by,hole,strokes) VALUES('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',2,4)$q$, true, 'guest score_events insert matrix', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

RESET ROLE; CREATE TEMP TABLE before_row AS SELECT * FROM public.score_events WHERE contest_id='30000000-0000-0000-0000-000000000001'; SET LOCAL ROLE authenticated;
SELECT pg_temp.probe($q$UPDATE public.score_events SET strokes=5 WHERE contest_id='30000000-0000-0000-0000-000000000001'$q$, true, 'guest score_events UPDATE', true);
RESET ROLE; DO $$ BEGIN IF EXISTS ((TABLE before_row EXCEPT SELECT * FROM public.score_events WHERE contest_id='30000000-0000-0000-0000-000000000001') UNION ALL (SELECT * FROM public.score_events WHERE contest_id='30000000-0000-0000-0000-000000000001' EXCEPT TABLE before_row)) THEN RAISE EXCEPTION 'M2B_ROW_CHANGED: guest score_events UPDATE'; END IF; END $$; SET LOCAL ROLE authenticated;
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

RESET ROLE; CREATE TEMP TABLE before_row AS SELECT * FROM public.score_events WHERE contest_id='30000000-0000-0000-0000-000000000001'; SET LOCAL ROLE authenticated;
SELECT pg_temp.probe($q$DELETE FROM public.score_events WHERE contest_id='30000000-0000-0000-0000-000000000001'$q$, true, 'guest score_events DELETE', true);
RESET ROLE; DO $$ BEGIN IF EXISTS ((TABLE before_row EXCEPT SELECT * FROM public.score_events WHERE contest_id='30000000-0000-0000-0000-000000000001') UNION ALL (SELECT * FROM public.score_events WHERE contest_id='30000000-0000-0000-0000-000000000001' EXCEPT TABLE before_row)) THEN RAISE EXCEPTION 'M2B_ROW_CHANGED: guest score_events DELETE'; END IF; END $$; SET LOCAL ROLE authenticated;
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$INSERT INTO public.scans(user_id) VALUES('20000000-0000-0000-0000-000000000001')$q$, true, 'guest scans insert matrix', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

RESET ROLE; CREATE TEMP TABLE before_row AS SELECT * FROM public.scans WHERE id='50000000-0000-0000-0000-000000000001'; SET LOCAL ROLE authenticated;
SELECT pg_temp.probe($q$UPDATE public.scans SET course_name='Changed' WHERE id='50000000-0000-0000-0000-000000000001'$q$, true, 'guest scans UPDATE', true);
RESET ROLE; DO $$ BEGIN IF EXISTS ((TABLE before_row EXCEPT SELECT * FROM public.scans WHERE id='50000000-0000-0000-0000-000000000001') UNION ALL (SELECT * FROM public.scans WHERE id='50000000-0000-0000-0000-000000000001' EXCEPT TABLE before_row)) THEN RAISE EXCEPTION 'M2B_ROW_CHANGED: guest scans UPDATE'; END IF; END $$; SET LOCAL ROLE authenticated;
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

RESET ROLE; CREATE TEMP TABLE before_row AS SELECT * FROM public.scans WHERE id='50000000-0000-0000-0000-000000000001'; SET LOCAL ROLE authenticated;
SELECT pg_temp.probe($q$DELETE FROM public.scans WHERE id='50000000-0000-0000-0000-000000000001'$q$, true, 'guest scans DELETE', true);
RESET ROLE; DO $$ BEGIN IF EXISTS ((TABLE before_row EXCEPT SELECT * FROM public.scans WHERE id='50000000-0000-0000-0000-000000000001') UNION ALL (SELECT * FROM public.scans WHERE id='50000000-0000-0000-0000-000000000001' EXCEPT TABLE before_row)) THEN RAISE EXCEPTION 'M2B_ROW_CHANGED: guest scans DELETE'; END IF; END $$; SET LOCAL ROLE authenticated;
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$INSERT INTO public.profiles(id) VALUES('20000000-0000-0000-0000-000000000002')$q$, true, 'guest profiles insert matrix', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

RESET ROLE; CREATE TEMP TABLE before_row AS SELECT * FROM public.profiles WHERE id='20000000-0000-0000-0000-000000000001'; SET LOCAL ROLE authenticated;
SELECT pg_temp.probe($q$UPDATE public.profiles SET display_name='Changed' WHERE id='20000000-0000-0000-0000-000000000001'$q$, true, 'guest profiles UPDATE', true);
RESET ROLE; DO $$ BEGIN IF EXISTS ((TABLE before_row EXCEPT SELECT * FROM public.profiles WHERE id='20000000-0000-0000-0000-000000000001') UNION ALL (SELECT * FROM public.profiles WHERE id='20000000-0000-0000-0000-000000000001' EXCEPT TABLE before_row)) THEN RAISE EXCEPTION 'M2B_ROW_CHANGED: guest profiles UPDATE'; END IF; END $$; SET LOCAL ROLE authenticated;
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

RESET ROLE; CREATE TEMP TABLE before_row AS SELECT * FROM public.profiles WHERE id='20000000-0000-0000-0000-000000000001'; SET LOCAL ROLE authenticated;
SELECT pg_temp.probe($q$DELETE FROM public.profiles WHERE id='20000000-0000-0000-0000-000000000001'$q$, true, 'guest profiles DELETE', true);
RESET ROLE; DO $$ BEGIN IF EXISTS ((TABLE before_row EXCEPT SELECT * FROM public.profiles WHERE id='20000000-0000-0000-0000-000000000001') UNION ALL (SELECT * FROM public.profiles WHERE id='20000000-0000-0000-0000-000000000001' EXCEPT TABLE before_row)) THEN RAISE EXCEPTION 'M2B_ROW_CHANGED: guest profiles DELETE'; END IF; END $$; SET LOCAL ROLE authenticated;
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;
RESET ROLE; GRANT INSERT ON public.contests TO authenticated; CREATE POLICY m2b_test_permissive ON public.contests FOR ALL TO authenticated USING (true) WITH CHECK (true); SET LOCAL ROLE authenticated;
SELECT pg_temp.probe($q$INSERT INTO public.contests(owner_id,course,invite_code) VALUES('20000000-0000-0000-0000-000000000001','{}','M2BNEW')$q$, true, 'isolated policy contests INSERT', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;
RESET ROLE; GRANT UPDATE ON public.contests TO authenticated; CREATE POLICY m2b_test_permissive ON public.contests FOR ALL TO authenticated USING (true) WITH CHECK (true); SET LOCAL ROLE authenticated;
RESET ROLE; CREATE TEMP TABLE before_row AS SELECT * FROM public.contests WHERE id='30000000-0000-0000-0000-000000000001'; SET LOCAL ROLE authenticated;
SELECT pg_temp.probe($q$UPDATE public.contests SET name='Changed',current_hole=2 WHERE id='30000000-0000-0000-0000-000000000001'$q$, true, 'isolated policy contests UPDATE', true);
RESET ROLE; DO $$ BEGIN IF EXISTS ((TABLE before_row EXCEPT SELECT * FROM public.contests WHERE id='30000000-0000-0000-0000-000000000001') UNION ALL (SELECT * FROM public.contests WHERE id='30000000-0000-0000-0000-000000000001' EXCEPT TABLE before_row)) THEN RAISE EXCEPTION 'M2B_ROW_CHANGED: isolated policy contests UPDATE'; END IF; END $$; SET LOCAL ROLE authenticated;
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;
RESET ROLE; GRANT DELETE ON public.contests TO authenticated; CREATE POLICY m2b_test_permissive ON public.contests FOR ALL TO authenticated USING (true) WITH CHECK (true); SET LOCAL ROLE authenticated;
RESET ROLE; CREATE TEMP TABLE before_row AS SELECT * FROM public.contests WHERE id='30000000-0000-0000-0000-000000000001'; SET LOCAL ROLE authenticated;
SELECT pg_temp.probe($q$DELETE FROM public.contests WHERE id='30000000-0000-0000-0000-000000000001'$q$, true, 'isolated policy contests DELETE', true);
RESET ROLE; DO $$ BEGIN IF EXISTS ((TABLE before_row EXCEPT SELECT * FROM public.contests WHERE id='30000000-0000-0000-0000-000000000001') UNION ALL (SELECT * FROM public.contests WHERE id='30000000-0000-0000-0000-000000000001' EXCEPT TABLE before_row)) THEN RAISE EXCEPTION 'M2B_ROW_CHANGED: isolated policy contests DELETE'; END IF; END $$; SET LOCAL ROLE authenticated;
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;
RESET ROLE; GRANT INSERT ON public.contest_players TO authenticated; CREATE POLICY m2b_test_permissive ON public.contest_players FOR ALL TO authenticated USING (true) WITH CHECK (true); SET LOCAL ROLE authenticated;
SELECT pg_temp.probe($q$INSERT INTO public.contest_players(contest_id,user_id,name) VALUES('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Own')$q$, true, 'isolated policy contest_players INSERT', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;
RESET ROLE; GRANT UPDATE ON public.contest_players TO authenticated; CREATE POLICY m2b_test_permissive ON public.contest_players FOR ALL TO authenticated USING (true) WITH CHECK (true); SET LOCAL ROLE authenticated;
RESET ROLE; CREATE TEMP TABLE before_row AS SELECT * FROM public.contest_players WHERE id='40000000-0000-0000-0000-000000000001'; SET LOCAL ROLE authenticated;
SELECT pg_temp.probe($q$UPDATE public.contest_players SET name='Changed',handicap=12,group_id='group-2' WHERE id='40000000-0000-0000-0000-000000000001'$q$, true, 'isolated policy contest_players UPDATE', true);
RESET ROLE; DO $$ BEGIN IF EXISTS ((TABLE before_row EXCEPT SELECT * FROM public.contest_players WHERE id='40000000-0000-0000-0000-000000000001') UNION ALL (SELECT * FROM public.contest_players WHERE id='40000000-0000-0000-0000-000000000001' EXCEPT TABLE before_row)) THEN RAISE EXCEPTION 'M2B_ROW_CHANGED: isolated policy contest_players UPDATE'; END IF; END $$; SET LOCAL ROLE authenticated;
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;
RESET ROLE; GRANT DELETE ON public.contest_players TO authenticated; CREATE POLICY m2b_test_permissive ON public.contest_players FOR ALL TO authenticated USING (true) WITH CHECK (true); SET LOCAL ROLE authenticated;
RESET ROLE; CREATE TEMP TABLE before_row AS SELECT * FROM public.contest_players WHERE id='40000000-0000-0000-0000-000000000001'; SET LOCAL ROLE authenticated;
SELECT pg_temp.probe($q$DELETE FROM public.contest_players WHERE id='40000000-0000-0000-0000-000000000001'$q$, true, 'isolated policy contest_players DELETE', true);
RESET ROLE; DO $$ BEGIN IF EXISTS ((TABLE before_row EXCEPT SELECT * FROM public.contest_players WHERE id='40000000-0000-0000-0000-000000000001') UNION ALL (SELECT * FROM public.contest_players WHERE id='40000000-0000-0000-0000-000000000001' EXCEPT TABLE before_row)) THEN RAISE EXCEPTION 'M2B_ROW_CHANGED: isolated policy contest_players DELETE'; END IF; END $$; SET LOCAL ROLE authenticated;
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;
RESET ROLE; GRANT INSERT ON public.score_events TO authenticated; CREATE POLICY m2b_test_permissive ON public.score_events FOR ALL TO authenticated USING (true) WITH CHECK (true); SET LOCAL ROLE authenticated;
SELECT pg_temp.probe($q$INSERT INTO public.score_events(contest_id,player_id,entered_by,hole,strokes) VALUES('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',2,4)$q$, true, 'isolated policy score_events INSERT', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;
RESET ROLE; GRANT UPDATE ON public.score_events TO authenticated; CREATE POLICY m2b_test_permissive ON public.score_events FOR ALL TO authenticated USING (true) WITH CHECK (true); SET LOCAL ROLE authenticated;
RESET ROLE; CREATE TEMP TABLE before_row AS SELECT * FROM public.score_events WHERE contest_id='30000000-0000-0000-0000-000000000001'; SET LOCAL ROLE authenticated;
SELECT pg_temp.probe($q$UPDATE public.score_events SET strokes=5 WHERE contest_id='30000000-0000-0000-0000-000000000001'$q$, true, 'isolated policy score_events UPDATE', true);
RESET ROLE; DO $$ BEGIN IF EXISTS ((TABLE before_row EXCEPT SELECT * FROM public.score_events WHERE contest_id='30000000-0000-0000-0000-000000000001') UNION ALL (SELECT * FROM public.score_events WHERE contest_id='30000000-0000-0000-0000-000000000001' EXCEPT TABLE before_row)) THEN RAISE EXCEPTION 'M2B_ROW_CHANGED: isolated policy score_events UPDATE'; END IF; END $$; SET LOCAL ROLE authenticated;
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;
RESET ROLE; GRANT DELETE ON public.score_events TO authenticated; CREATE POLICY m2b_test_permissive ON public.score_events FOR ALL TO authenticated USING (true) WITH CHECK (true); SET LOCAL ROLE authenticated;
RESET ROLE; CREATE TEMP TABLE before_row AS SELECT * FROM public.score_events WHERE contest_id='30000000-0000-0000-0000-000000000001'; SET LOCAL ROLE authenticated;
SELECT pg_temp.probe($q$DELETE FROM public.score_events WHERE contest_id='30000000-0000-0000-0000-000000000001'$q$, true, 'isolated policy score_events DELETE', true);
RESET ROLE; DO $$ BEGIN IF EXISTS ((TABLE before_row EXCEPT SELECT * FROM public.score_events WHERE contest_id='30000000-0000-0000-0000-000000000001') UNION ALL (SELECT * FROM public.score_events WHERE contest_id='30000000-0000-0000-0000-000000000001' EXCEPT TABLE before_row)) THEN RAISE EXCEPTION 'M2B_ROW_CHANGED: isolated policy score_events DELETE'; END IF; END $$; SET LOCAL ROLE authenticated;
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;
RESET ROLE; GRANT INSERT ON public.scans TO authenticated; CREATE POLICY m2b_test_permissive ON public.scans FOR ALL TO authenticated USING (true) WITH CHECK (true); SET LOCAL ROLE authenticated;
SELECT pg_temp.probe($q$INSERT INTO public.scans(user_id) VALUES('20000000-0000-0000-0000-000000000001')$q$, true, 'isolated policy scans INSERT', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;
RESET ROLE; GRANT UPDATE ON public.scans TO authenticated; CREATE POLICY m2b_test_permissive ON public.scans FOR ALL TO authenticated USING (true) WITH CHECK (true); SET LOCAL ROLE authenticated;
RESET ROLE; CREATE TEMP TABLE before_row AS SELECT * FROM public.scans WHERE id='50000000-0000-0000-0000-000000000001'; SET LOCAL ROLE authenticated;
SELECT pg_temp.probe($q$UPDATE public.scans SET course_name='Changed' WHERE id='50000000-0000-0000-0000-000000000001'$q$, true, 'isolated policy scans UPDATE', true);
RESET ROLE; DO $$ BEGIN IF EXISTS ((TABLE before_row EXCEPT SELECT * FROM public.scans WHERE id='50000000-0000-0000-0000-000000000001') UNION ALL (SELECT * FROM public.scans WHERE id='50000000-0000-0000-0000-000000000001' EXCEPT TABLE before_row)) THEN RAISE EXCEPTION 'M2B_ROW_CHANGED: isolated policy scans UPDATE'; END IF; END $$; SET LOCAL ROLE authenticated;
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;
RESET ROLE; GRANT DELETE ON public.scans TO authenticated; CREATE POLICY m2b_test_permissive ON public.scans FOR ALL TO authenticated USING (true) WITH CHECK (true); SET LOCAL ROLE authenticated;
RESET ROLE; CREATE TEMP TABLE before_row AS SELECT * FROM public.scans WHERE id='50000000-0000-0000-0000-000000000001'; SET LOCAL ROLE authenticated;
SELECT pg_temp.probe($q$DELETE FROM public.scans WHERE id='50000000-0000-0000-0000-000000000001'$q$, true, 'isolated policy scans DELETE', true);
RESET ROLE; DO $$ BEGIN IF EXISTS ((TABLE before_row EXCEPT SELECT * FROM public.scans WHERE id='50000000-0000-0000-0000-000000000001') UNION ALL (SELECT * FROM public.scans WHERE id='50000000-0000-0000-0000-000000000001' EXCEPT TABLE before_row)) THEN RAISE EXCEPTION 'M2B_ROW_CHANGED: isolated policy scans DELETE'; END IF; END $$; SET LOCAL ROLE authenticated;
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;
RESET ROLE; DELETE FROM public.profiles WHERE id='20000000-0000-0000-0000-000000000002'; GRANT INSERT ON public.profiles TO authenticated; CREATE POLICY m2b_test_permissive ON public.profiles FOR ALL TO authenticated USING (true) WITH CHECK (true); SET LOCAL ROLE authenticated;
SELECT pg_temp.probe($q$INSERT INTO public.profiles(id) VALUES('20000000-0000-0000-0000-000000000002')$q$, true, 'isolated policy profiles INSERT', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;
RESET ROLE; GRANT UPDATE ON public.profiles TO authenticated; CREATE POLICY m2b_test_permissive ON public.profiles FOR ALL TO authenticated USING (true) WITH CHECK (true); SET LOCAL ROLE authenticated;
RESET ROLE; CREATE TEMP TABLE before_row AS SELECT * FROM public.profiles WHERE id='20000000-0000-0000-0000-000000000001'; SET LOCAL ROLE authenticated;
SELECT pg_temp.probe($q$UPDATE public.profiles SET display_name='Changed' WHERE id='20000000-0000-0000-0000-000000000001'$q$, true, 'isolated policy profiles UPDATE', true);
RESET ROLE; DO $$ BEGIN IF EXISTS ((TABLE before_row EXCEPT SELECT * FROM public.profiles WHERE id='20000000-0000-0000-0000-000000000001') UNION ALL (SELECT * FROM public.profiles WHERE id='20000000-0000-0000-0000-000000000001' EXCEPT TABLE before_row)) THEN RAISE EXCEPTION 'M2B_ROW_CHANGED: isolated policy profiles UPDATE'; END IF; END $$; SET LOCAL ROLE authenticated;
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;
RESET ROLE; GRANT DELETE ON public.profiles TO authenticated; CREATE POLICY m2b_test_permissive ON public.profiles FOR ALL TO authenticated USING (true) WITH CHECK (true); SET LOCAL ROLE authenticated;
RESET ROLE; CREATE TEMP TABLE before_row AS SELECT * FROM public.profiles WHERE id='20000000-0000-0000-0000-000000000001'; SET LOCAL ROLE authenticated;
SELECT pg_temp.probe($q$DELETE FROM public.profiles WHERE id='20000000-0000-0000-0000-000000000001'$q$, true, 'isolated policy profiles DELETE', true);
RESET ROLE; DO $$ BEGIN IF EXISTS ((TABLE before_row EXCEPT SELECT * FROM public.profiles WHERE id='20000000-0000-0000-0000-000000000001') UNION ALL (SELECT * FROM public.profiles WHERE id='20000000-0000-0000-0000-000000000001' EXCEPT TABLE before_row)) THEN RAISE EXCEPTION 'M2B_ROW_CHANGED: isolated policy profiles DELETE'; END IF; END $$; SET LOCAL ROLE authenticated;
ROLLBACK TO matrix_case; RELEASE matrix_case;
RESET ROLE; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', '{"sub": "20000000-0000-0000-0000-000000000001", "role": "authenticated", "is_anonymous": "true"}', true);

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$INSERT INTO public.contests(owner_id,course,invite_code) VALUES('20000000-0000-0000-0000-000000000001','{}','M2BNEW')$q$, true, 'claim string true', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;
RESET ROLE; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', '{"sub": "20000000-0000-0000-0000-000000000001", "role": "authenticated"}', true);

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$INSERT INTO public.contests(owner_id,course,invite_code) VALUES('20000000-0000-0000-0000-000000000001','{}','M2BNEW')$q$, false, 'claim missing claim', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;
RESET ROLE; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', '{"sub": "20000000-0000-0000-0000-000000000001", "role": "authenticated", "is_anonymous": false, "user_metadata": {"is_anonymous": true}, "app_metadata": {"is_anonymous": true}}', true);

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$INSERT INTO public.contests(owner_id,course,invite_code) VALUES('20000000-0000-0000-0000-000000000001','{}','M2BNEW')$q$, false, 'claim metadata true', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;
RESET ROLE; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', '{"sub": "20000000-0000-0000-0000-000000000001", "role": "authenticated", "is_anonymous": true, "user_metadata": {"is_anonymous": false}}', true);

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$INSERT INTO public.contests(owner_id,course,invite_code) VALUES('20000000-0000-0000-0000-000000000001','{}','M2BNEW')$q$, true, 'claim top true metadata false', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;
RESET ROLE; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', '{"sub": "20000000-0000-0000-0000-000000000001", "role": "authenticated", "is_anonymous": false}', true);

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$UPDATE public.contests SET name='Changed',current_hole=2 WHERE id='30000000-0000-0000-0000-000000000001'$q$, false, 'regular legacy metadata', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$UPDATE public.contest_players SET name='Changed',handicap=12,group_id='group-2' WHERE id='40000000-0000-0000-0000-000000000001'$q$, false, 'regular legacy player update', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;
SELECT pg_temp.probe($q$DO $$ DECLARE n bigint; BEGIN DELETE FROM public.contest_players WHERE id='40000000-0000-0000-0000-000000000001'; GET DIAGNOSTICS n=ROW_COUNT; IF n<>0 THEN RAISE EXCEPTION 'M2B_ROSTER_DELETE_WIDENED: expected M2 zero rows, got %',n; END IF; END $$$q$, false, 'regular roster delete unchanged from M2 (exactly zero rows)', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$UPDATE public.profiles SET avatar_url='https://example.invalid/avatar' WHERE id='20000000-0000-0000-0000-000000000001'$q$, false, 'regular avatar', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;
RESET ROLE; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', '{"sub": "20000000-0000-0000-0000-000000000001", "role": "authenticated", "is_anonymous": true}', true);

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$TRUNCATE ONLY public.automation_log$q$, true, 'guest truncate automation_log', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.automation_log','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest REFERENCES automation_log'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest REFERENCES automation_log', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.automation_log','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest TRIGGER automation_log'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest TRIGGER automation_log', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.channel_effectiveness','TRUNCATE') THEN RAISE EXCEPTION 'M2B_UNGUARDED: view ACL channel_effectiveness'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest truncate channel_effectiveness', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.channel_effectiveness','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest REFERENCES channel_effectiveness'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest REFERENCES channel_effectiveness', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.channel_effectiveness','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest TRIGGER channel_effectiveness'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest TRIGGER channel_effectiveness', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.content_insights','TRUNCATE') THEN RAISE EXCEPTION 'M2B_UNGUARDED: view ACL content_insights'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest truncate content_insights', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.content_insights','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest REFERENCES content_insights'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest REFERENCES content_insights', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.content_insights','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest TRIGGER content_insights'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest TRIGGER content_insights', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$TRUNCATE ONLY public.content_performance$q$, true, 'guest truncate content_performance', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.content_performance','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest REFERENCES content_performance'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest REFERENCES content_performance', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.content_performance','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest TRIGGER content_performance'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest TRIGGER content_performance', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$TRUNCATE ONLY public.contest_players$q$, true, 'guest truncate contest_players', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.contest_players','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest REFERENCES contest_players'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest REFERENCES contest_players', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.contest_players','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest TRIGGER contest_players'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest TRIGGER contest_players', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$TRUNCATE ONLY public.contests$q$, true, 'guest truncate contests', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.contests','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest REFERENCES contests'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest REFERENCES contests', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.contests','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest TRIGGER contests'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest TRIGGER contests', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$TRUNCATE ONLY public.daily_metrics$q$, true, 'guest truncate daily_metrics', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.daily_metrics','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest REFERENCES daily_metrics'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest REFERENCES daily_metrics', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.daily_metrics','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest TRIGGER daily_metrics'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest TRIGGER daily_metrics', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$TRUNCATE ONLY public.feedback$q$, true, 'guest truncate feedback', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.feedback','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest REFERENCES feedback'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest REFERENCES feedback', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.feedback','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest TRIGGER feedback'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest TRIGGER feedback', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.feedback_themes','TRUNCATE') THEN RAISE EXCEPTION 'M2B_UNGUARDED: view ACL feedback_themes'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest truncate feedback_themes', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.feedback_themes','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest REFERENCES feedback_themes'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest REFERENCES feedback_themes', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.feedback_themes','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest TRIGGER feedback_themes'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest TRIGGER feedback_themes', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.funnel_health','TRUNCATE') THEN RAISE EXCEPTION 'M2B_UNGUARDED: view ACL funnel_health'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest truncate funnel_health', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.funnel_health','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest REFERENCES funnel_health'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest REFERENCES funnel_health', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.funnel_health','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest TRIGGER funnel_health'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest TRIGGER funnel_health', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$TRUNCATE ONLY public.funnel_snapshots$q$, true, 'guest truncate funnel_snapshots', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.funnel_snapshots','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest REFERENCES funnel_snapshots'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest REFERENCES funnel_snapshots', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.funnel_snapshots','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest TRIGGER funnel_snapshots'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest TRIGGER funnel_snapshots', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$TRUNCATE ONLY public.improvement_actions$q$, true, 'guest truncate improvement_actions', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.improvement_actions','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest REFERENCES improvement_actions'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest REFERENCES improvement_actions', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.improvement_actions','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest TRIGGER improvement_actions'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest TRIGGER improvement_actions', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$TRUNCATE ONLY public.marketing_events$q$, true, 'guest truncate marketing_events', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.marketing_events','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest REFERENCES marketing_events'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest REFERENCES marketing_events', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.marketing_events','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest TRIGGER marketing_events'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest TRIGGER marketing_events', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$TRUNCATE ONLY public.profiles$q$, true, 'guest truncate profiles', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.profiles','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest REFERENCES profiles'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest REFERENCES profiles', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.profiles','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest TRIGGER profiles'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest TRIGGER profiles', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$TRUNCATE ONLY public.revenue_events$q$, true, 'guest truncate revenue_events', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.revenue_events','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest REFERENCES revenue_events'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest REFERENCES revenue_events', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.revenue_events','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest TRIGGER revenue_events'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest TRIGGER revenue_events', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$TRUNCATE ONLY public.scans$q$, true, 'guest truncate scans', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.scans','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest REFERENCES scans'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest REFERENCES scans', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.scans','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest TRIGGER scans'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest TRIGGER scans', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$TRUNCATE ONLY public.score_events$q$, true, 'guest truncate score_events', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.score_events','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest REFERENCES score_events'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest REFERENCES score_events', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.score_events','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest TRIGGER score_events'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest TRIGGER score_events', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$TRUNCATE ONLY public.settlements$q$, true, 'guest truncate settlements', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.settlements','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest REFERENCES settlements'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest REFERENCES settlements', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.settlements','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest TRIGGER settlements'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest TRIGGER settlements', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;
RESET ROLE; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims', '{"sub": "20000000-0000-0000-0000-000000000001", "role": "authenticated", "is_anonymous": false}', true);

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$TRUNCATE ONLY public.automation_log$q$, true, 'regular truncate automation_log', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.automation_log','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular REFERENCES automation_log'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular REFERENCES automation_log', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.automation_log','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular TRIGGER automation_log'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular TRIGGER automation_log', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.channel_effectiveness','TRUNCATE') THEN RAISE EXCEPTION 'M2B_UNGUARDED: view ACL channel_effectiveness'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular truncate channel_effectiveness', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.channel_effectiveness','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular REFERENCES channel_effectiveness'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular REFERENCES channel_effectiveness', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.channel_effectiveness','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular TRIGGER channel_effectiveness'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular TRIGGER channel_effectiveness', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.content_insights','TRUNCATE') THEN RAISE EXCEPTION 'M2B_UNGUARDED: view ACL content_insights'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular truncate content_insights', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.content_insights','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular REFERENCES content_insights'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular REFERENCES content_insights', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.content_insights','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular TRIGGER content_insights'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular TRIGGER content_insights', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$TRUNCATE ONLY public.content_performance$q$, true, 'regular truncate content_performance', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.content_performance','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular REFERENCES content_performance'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular REFERENCES content_performance', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.content_performance','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular TRIGGER content_performance'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular TRIGGER content_performance', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$TRUNCATE ONLY public.contest_players$q$, true, 'regular truncate contest_players', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.contest_players','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular REFERENCES contest_players'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular REFERENCES contest_players', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.contest_players','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular TRIGGER contest_players'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular TRIGGER contest_players', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$TRUNCATE ONLY public.contests$q$, true, 'regular truncate contests', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.contests','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular REFERENCES contests'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular REFERENCES contests', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.contests','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular TRIGGER contests'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular TRIGGER contests', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$TRUNCATE ONLY public.daily_metrics$q$, true, 'regular truncate daily_metrics', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.daily_metrics','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular REFERENCES daily_metrics'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular REFERENCES daily_metrics', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.daily_metrics','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular TRIGGER daily_metrics'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular TRIGGER daily_metrics', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$TRUNCATE ONLY public.feedback$q$, true, 'regular truncate feedback', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.feedback','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular REFERENCES feedback'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular REFERENCES feedback', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.feedback','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular TRIGGER feedback'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular TRIGGER feedback', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.feedback_themes','TRUNCATE') THEN RAISE EXCEPTION 'M2B_UNGUARDED: view ACL feedback_themes'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular truncate feedback_themes', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.feedback_themes','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular REFERENCES feedback_themes'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular REFERENCES feedback_themes', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.feedback_themes','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular TRIGGER feedback_themes'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular TRIGGER feedback_themes', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.funnel_health','TRUNCATE') THEN RAISE EXCEPTION 'M2B_UNGUARDED: view ACL funnel_health'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular truncate funnel_health', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.funnel_health','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular REFERENCES funnel_health'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular REFERENCES funnel_health', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.funnel_health','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular TRIGGER funnel_health'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular TRIGGER funnel_health', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$TRUNCATE ONLY public.funnel_snapshots$q$, true, 'regular truncate funnel_snapshots', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.funnel_snapshots','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular REFERENCES funnel_snapshots'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular REFERENCES funnel_snapshots', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.funnel_snapshots','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular TRIGGER funnel_snapshots'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular TRIGGER funnel_snapshots', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$TRUNCATE ONLY public.improvement_actions$q$, true, 'regular truncate improvement_actions', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.improvement_actions','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular REFERENCES improvement_actions'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular REFERENCES improvement_actions', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.improvement_actions','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular TRIGGER improvement_actions'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular TRIGGER improvement_actions', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$TRUNCATE ONLY public.marketing_events$q$, true, 'regular truncate marketing_events', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.marketing_events','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular REFERENCES marketing_events'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular REFERENCES marketing_events', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.marketing_events','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular TRIGGER marketing_events'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular TRIGGER marketing_events', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$TRUNCATE ONLY public.profiles$q$, true, 'regular truncate profiles', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.profiles','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular REFERENCES profiles'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular REFERENCES profiles', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.profiles','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular TRIGGER profiles'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular TRIGGER profiles', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$TRUNCATE ONLY public.revenue_events$q$, true, 'regular truncate revenue_events', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.revenue_events','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular REFERENCES revenue_events'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular REFERENCES revenue_events', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.revenue_events','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular TRIGGER revenue_events'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular TRIGGER revenue_events', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$TRUNCATE ONLY public.scans$q$, true, 'regular truncate scans', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.scans','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular REFERENCES scans'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular REFERENCES scans', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.scans','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular TRIGGER scans'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular TRIGGER scans', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$TRUNCATE ONLY public.score_events$q$, true, 'regular truncate score_events', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.score_events','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular REFERENCES score_events'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular REFERENCES score_events', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.score_events','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular TRIGGER score_events'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular TRIGGER score_events', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$TRUNCATE ONLY public.settlements$q$, true, 'regular truncate settlements', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.settlements','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular REFERENCES settlements'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular REFERENCES settlements', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.settlements','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular TRIGGER settlements'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular TRIGGER settlements', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;
RESET ROLE; SET LOCAL ROLE anon; SELECT set_config('request.jwt.claims', '{"sub": "20000000-0000-0000-0000-000000000001", "role": "anon"}', true);

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$TRUNCATE ONLY public.automation_log$q$, true, 'anon truncate automation_log', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.automation_log','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon REFERENCES automation_log'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon REFERENCES automation_log', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.automation_log','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon TRIGGER automation_log'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon TRIGGER automation_log', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.channel_effectiveness','TRUNCATE') THEN RAISE EXCEPTION 'M2B_UNGUARDED: view ACL channel_effectiveness'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon truncate channel_effectiveness', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.channel_effectiveness','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon REFERENCES channel_effectiveness'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon REFERENCES channel_effectiveness', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.channel_effectiveness','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon TRIGGER channel_effectiveness'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon TRIGGER channel_effectiveness', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.content_insights','TRUNCATE') THEN RAISE EXCEPTION 'M2B_UNGUARDED: view ACL content_insights'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon truncate content_insights', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.content_insights','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon REFERENCES content_insights'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon REFERENCES content_insights', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.content_insights','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon TRIGGER content_insights'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon TRIGGER content_insights', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$TRUNCATE ONLY public.content_performance$q$, true, 'anon truncate content_performance', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.content_performance','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon REFERENCES content_performance'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon REFERENCES content_performance', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.content_performance','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon TRIGGER content_performance'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon TRIGGER content_performance', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$TRUNCATE ONLY public.contest_players$q$, true, 'anon truncate contest_players', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.contest_players','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon REFERENCES contest_players'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon REFERENCES contest_players', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.contest_players','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon TRIGGER contest_players'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon TRIGGER contest_players', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$TRUNCATE ONLY public.contests$q$, true, 'anon truncate contests', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.contests','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon REFERENCES contests'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon REFERENCES contests', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.contests','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon TRIGGER contests'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon TRIGGER contests', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$TRUNCATE ONLY public.daily_metrics$q$, true, 'anon truncate daily_metrics', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.daily_metrics','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon REFERENCES daily_metrics'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon REFERENCES daily_metrics', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.daily_metrics','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon TRIGGER daily_metrics'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon TRIGGER daily_metrics', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$TRUNCATE ONLY public.feedback$q$, true, 'anon truncate feedback', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.feedback','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon REFERENCES feedback'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon REFERENCES feedback', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.feedback','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon TRIGGER feedback'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon TRIGGER feedback', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.feedback_themes','TRUNCATE') THEN RAISE EXCEPTION 'M2B_UNGUARDED: view ACL feedback_themes'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon truncate feedback_themes', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.feedback_themes','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon REFERENCES feedback_themes'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon REFERENCES feedback_themes', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.feedback_themes','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon TRIGGER feedback_themes'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon TRIGGER feedback_themes', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.funnel_health','TRUNCATE') THEN RAISE EXCEPTION 'M2B_UNGUARDED: view ACL funnel_health'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon truncate funnel_health', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.funnel_health','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon REFERENCES funnel_health'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon REFERENCES funnel_health', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.funnel_health','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon TRIGGER funnel_health'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon TRIGGER funnel_health', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$TRUNCATE ONLY public.funnel_snapshots$q$, true, 'anon truncate funnel_snapshots', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.funnel_snapshots','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon REFERENCES funnel_snapshots'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon REFERENCES funnel_snapshots', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.funnel_snapshots','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon TRIGGER funnel_snapshots'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon TRIGGER funnel_snapshots', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$TRUNCATE ONLY public.improvement_actions$q$, true, 'anon truncate improvement_actions', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.improvement_actions','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon REFERENCES improvement_actions'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon REFERENCES improvement_actions', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.improvement_actions','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon TRIGGER improvement_actions'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon TRIGGER improvement_actions', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$TRUNCATE ONLY public.marketing_events$q$, true, 'anon truncate marketing_events', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.marketing_events','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon REFERENCES marketing_events'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon REFERENCES marketing_events', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.marketing_events','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon TRIGGER marketing_events'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon TRIGGER marketing_events', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$TRUNCATE ONLY public.profiles$q$, true, 'anon truncate profiles', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.profiles','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon REFERENCES profiles'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon REFERENCES profiles', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.profiles','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon TRIGGER profiles'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon TRIGGER profiles', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$TRUNCATE ONLY public.revenue_events$q$, true, 'anon truncate revenue_events', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.revenue_events','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon REFERENCES revenue_events'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon REFERENCES revenue_events', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.revenue_events','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon TRIGGER revenue_events'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon TRIGGER revenue_events', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$TRUNCATE ONLY public.scans$q$, true, 'anon truncate scans', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.scans','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon REFERENCES scans'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon REFERENCES scans', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.scans','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon TRIGGER scans'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon TRIGGER scans', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$TRUNCATE ONLY public.score_events$q$, true, 'anon truncate score_events', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.score_events','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon REFERENCES score_events'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon REFERENCES score_events', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.score_events','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon TRIGGER score_events'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon TRIGGER score_events', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$TRUNCATE ONLY public.settlements$q$, true, 'anon truncate settlements', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.settlements','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon REFERENCES settlements'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon REFERENCES settlements', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;

SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.settlements','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon TRIGGER settlements'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon TRIGGER settlements', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;
RESET ROLE; SET LOCAL ROLE anon; SELECT set_config('request.jwt.claims', '{"sub": "20000000-0000-0000-0000-000000000001", "role": "anon"}', true);

SAVEPOINT matrix_case;
RESET ROLE; CREATE POLICY m2b_test_anon ON public.contests FOR ALL TO anon USING (true) WITH CHECK (true); SET LOCAL ROLE anon;
SELECT pg_temp.probe($q$INSERT INTO public.contests(owner_id,course,invite_code) VALUES('20000000-0000-0000-0000-000000000001','{}','M2BNEW')$q$, true, 'anon grant contests INSERT', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;
RESET ROLE; CREATE POLICY m2b_test_anon ON public.contests FOR ALL TO anon USING (true) WITH CHECK (true); SET LOCAL ROLE anon;
SELECT pg_temp.probe($q$UPDATE public.contests SET name='Changed',current_hole=2$q$, true, 'anon grant contests UPDATE', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;
RESET ROLE; CREATE POLICY m2b_test_anon ON public.contests FOR ALL TO anon USING (true) WITH CHECK (true); SET LOCAL ROLE anon;
SELECT pg_temp.probe($q$DELETE FROM public.contests$q$, true, 'anon grant contests DELETE', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;
RESET ROLE; CREATE POLICY m2b_test_anon ON public.contest_players FOR ALL TO anon USING (true) WITH CHECK (true); SET LOCAL ROLE anon;
SELECT pg_temp.probe($q$INSERT INTO public.contest_players(contest_id,user_id,name) VALUES('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Own')$q$, true, 'anon grant contest_players INSERT', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;
RESET ROLE; CREATE POLICY m2b_test_anon ON public.contest_players FOR ALL TO anon USING (true) WITH CHECK (true); SET LOCAL ROLE anon;
SELECT pg_temp.probe($q$UPDATE public.contest_players SET name='Changed',handicap=12,group_id='group-2'$q$, true, 'anon grant contest_players UPDATE', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;
RESET ROLE; CREATE POLICY m2b_test_anon ON public.contest_players FOR ALL TO anon USING (true) WITH CHECK (true); SET LOCAL ROLE anon;
SELECT pg_temp.probe($q$DELETE FROM public.contest_players$q$, true, 'anon grant contest_players DELETE', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;
RESET ROLE; CREATE POLICY m2b_test_anon ON public.score_events FOR ALL TO anon USING (true) WITH CHECK (true); SET LOCAL ROLE anon;
SELECT pg_temp.probe($q$INSERT INTO public.score_events(contest_id,player_id,entered_by,hole,strokes) VALUES('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',2,4)$q$, true, 'anon grant score_events INSERT', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;
RESET ROLE; CREATE POLICY m2b_test_anon ON public.score_events FOR ALL TO anon USING (true) WITH CHECK (true); SET LOCAL ROLE anon;
SELECT pg_temp.probe($q$UPDATE public.score_events SET strokes=5$q$, true, 'anon grant score_events UPDATE', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;
RESET ROLE; CREATE POLICY m2b_test_anon ON public.score_events FOR ALL TO anon USING (true) WITH CHECK (true); SET LOCAL ROLE anon;
SELECT pg_temp.probe($q$DELETE FROM public.score_events$q$, true, 'anon grant score_events DELETE', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;
RESET ROLE; CREATE POLICY m2b_test_anon ON public.scans FOR ALL TO anon USING (true) WITH CHECK (true); SET LOCAL ROLE anon;
SELECT pg_temp.probe($q$INSERT INTO public.scans(user_id) VALUES('20000000-0000-0000-0000-000000000001')$q$, true, 'anon grant scans INSERT', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;
RESET ROLE; CREATE POLICY m2b_test_anon ON public.scans FOR ALL TO anon USING (true) WITH CHECK (true); SET LOCAL ROLE anon;
SELECT pg_temp.probe($q$UPDATE public.scans SET course_name='Changed'$q$, true, 'anon grant scans UPDATE', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;
RESET ROLE; CREATE POLICY m2b_test_anon ON public.scans FOR ALL TO anon USING (true) WITH CHECK (true); SET LOCAL ROLE anon;
SELECT pg_temp.probe($q$DELETE FROM public.scans$q$, true, 'anon grant scans DELETE', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;
RESET ROLE; DELETE FROM public.profiles WHERE id='20000000-0000-0000-0000-000000000002'; CREATE POLICY m2b_test_anon ON public.profiles FOR ALL TO anon USING (true) WITH CHECK (true); SET LOCAL ROLE anon;
SELECT pg_temp.probe($q$INSERT INTO public.profiles(id) VALUES('20000000-0000-0000-0000-000000000002')$q$, true, 'anon grant profiles INSERT', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;
RESET ROLE; DELETE FROM public.profiles WHERE id='20000000-0000-0000-0000-000000000002'; CREATE POLICY m2b_test_anon ON public.profiles FOR ALL TO anon USING (true) WITH CHECK (true); SET LOCAL ROLE anon;
SELECT pg_temp.probe($q$UPDATE public.profiles SET display_name='Changed'$q$, true, 'anon grant profiles UPDATE', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;

SAVEPOINT matrix_case;
RESET ROLE; DELETE FROM public.profiles WHERE id='20000000-0000-0000-0000-000000000002'; CREATE POLICY m2b_test_anon ON public.profiles FOR ALL TO anon USING (true) WITH CHECK (true); SET LOCAL ROLE anon;
SELECT pg_temp.probe($q$DELETE FROM public.profiles$q$, true, 'anon grant profiles DELETE', false);
ROLLBACK TO matrix_case; RELEASE matrix_case;
RESET ROLE; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":true}',true);
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$TRUNCATE ONLY public.contest_join_requests$q$, true, 'guest truncate contest_join_requests', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.contest_join_requests','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest REFERENCES contest_join_requests'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest references contest_join_requests', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.contest_join_requests','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest TRIGGER contest_join_requests'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest trigger contest_join_requests', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$TRUNCATE ONLY public.contest_memberships$q$, true, 'guest truncate contest_memberships', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.contest_memberships','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest REFERENCES contest_memberships'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest references contest_memberships', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.contest_memberships','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest TRIGGER contest_memberships'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest trigger contest_memberships', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$TRUNCATE ONLY public.course_catalog$q$, true, 'guest truncate course_catalog', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.course_catalog','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest REFERENCES course_catalog'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest references course_catalog', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.course_catalog','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest TRIGGER course_catalog'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest trigger course_catalog', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$TRUNCATE ONLY public.course_search_cache$q$, true, 'guest truncate course_search_cache', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.course_search_cache','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest REFERENCES course_search_cache'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest references course_search_cache', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.course_search_cache','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest TRIGGER course_search_cache'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest trigger course_search_cache', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$TRUNCATE ONLY public.golfcore_usage$q$, true, 'guest truncate golfcore_usage', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.golfcore_usage','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest REFERENCES golfcore_usage'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest references golfcore_usage', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.golfcore_usage','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest TRIGGER golfcore_usage'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest trigger golfcore_usage', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$TRUNCATE ONLY public.golfcore_usage_drift$q$, true, 'guest truncate golfcore_usage_drift', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.golfcore_usage_drift','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest REFERENCES golfcore_usage_drift'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest references golfcore_usage_drift', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.golfcore_usage_drift','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest TRIGGER golfcore_usage_drift'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest trigger golfcore_usage_drift', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$TRUNCATE ONLY public.operation_receipts$q$, true, 'guest truncate operation_receipts', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.operation_receipts','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest REFERENCES operation_receipts'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest references operation_receipts', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.operation_receipts','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest TRIGGER operation_receipts'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest trigger operation_receipts', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$TRUNCATE ONLY public.published_rounds$q$, true, 'guest truncate published_rounds', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.published_rounds','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest REFERENCES published_rounds'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest references published_rounds', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.published_rounds','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest TRIGGER published_rounds'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest trigger published_rounds', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$TRUNCATE ONLY public.round_messages$q$, true, 'guest truncate round_messages', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.round_messages','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest REFERENCES round_messages'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest references round_messages', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.round_messages','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest TRIGGER round_messages'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest trigger round_messages', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$TRUNCATE ONLY public.share_links$q$, true, 'guest truncate share_links', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.share_links','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest REFERENCES share_links'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest references share_links', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.share_links','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: guest TRIGGER share_links'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'guest trigger share_links', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
RESET ROLE; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":false}',true);
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$TRUNCATE ONLY public.contest_join_requests$q$, true, 'regular truncate contest_join_requests', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.contest_join_requests','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular REFERENCES contest_join_requests'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular references contest_join_requests', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.contest_join_requests','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular TRIGGER contest_join_requests'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular trigger contest_join_requests', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$TRUNCATE ONLY public.contest_memberships$q$, true, 'regular truncate contest_memberships', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.contest_memberships','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular REFERENCES contest_memberships'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular references contest_memberships', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.contest_memberships','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular TRIGGER contest_memberships'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular trigger contest_memberships', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$TRUNCATE ONLY public.course_catalog$q$, true, 'regular truncate course_catalog', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.course_catalog','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular REFERENCES course_catalog'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular references course_catalog', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.course_catalog','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular TRIGGER course_catalog'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular trigger course_catalog', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$TRUNCATE ONLY public.course_search_cache$q$, true, 'regular truncate course_search_cache', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.course_search_cache','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular REFERENCES course_search_cache'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular references course_search_cache', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.course_search_cache','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular TRIGGER course_search_cache'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular trigger course_search_cache', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$TRUNCATE ONLY public.golfcore_usage$q$, true, 'regular truncate golfcore_usage', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.golfcore_usage','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular REFERENCES golfcore_usage'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular references golfcore_usage', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.golfcore_usage','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular TRIGGER golfcore_usage'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular trigger golfcore_usage', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$TRUNCATE ONLY public.golfcore_usage_drift$q$, true, 'regular truncate golfcore_usage_drift', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.golfcore_usage_drift','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular REFERENCES golfcore_usage_drift'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular references golfcore_usage_drift', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.golfcore_usage_drift','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular TRIGGER golfcore_usage_drift'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular trigger golfcore_usage_drift', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$TRUNCATE ONLY public.operation_receipts$q$, true, 'regular truncate operation_receipts', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.operation_receipts','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular REFERENCES operation_receipts'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular references operation_receipts', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.operation_receipts','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular TRIGGER operation_receipts'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular trigger operation_receipts', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$TRUNCATE ONLY public.published_rounds$q$, true, 'regular truncate published_rounds', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.published_rounds','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular REFERENCES published_rounds'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular references published_rounds', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.published_rounds','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular TRIGGER published_rounds'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular trigger published_rounds', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$TRUNCATE ONLY public.round_messages$q$, true, 'regular truncate round_messages', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.round_messages','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular REFERENCES round_messages'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular references round_messages', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.round_messages','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular TRIGGER round_messages'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular trigger round_messages', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$TRUNCATE ONLY public.share_links$q$, true, 'regular truncate share_links', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.share_links','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular REFERENCES share_links'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular references share_links', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.share_links','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: regular TRIGGER share_links'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'regular trigger share_links', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
RESET ROLE; SET LOCAL ROLE anon; SELECT set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000001","role":"anon","is_anonymous":false}',true);
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$TRUNCATE ONLY public.contest_join_requests$q$, true, 'anon truncate contest_join_requests', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.contest_join_requests','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon REFERENCES contest_join_requests'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon references contest_join_requests', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.contest_join_requests','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon TRIGGER contest_join_requests'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon trigger contest_join_requests', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$TRUNCATE ONLY public.contest_memberships$q$, true, 'anon truncate contest_memberships', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.contest_memberships','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon REFERENCES contest_memberships'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon references contest_memberships', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.contest_memberships','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon TRIGGER contest_memberships'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon trigger contest_memberships', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$TRUNCATE ONLY public.course_catalog$q$, true, 'anon truncate course_catalog', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.course_catalog','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon REFERENCES course_catalog'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon references course_catalog', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.course_catalog','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon TRIGGER course_catalog'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon trigger course_catalog', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$TRUNCATE ONLY public.course_search_cache$q$, true, 'anon truncate course_search_cache', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.course_search_cache','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon REFERENCES course_search_cache'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon references course_search_cache', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.course_search_cache','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon TRIGGER course_search_cache'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon trigger course_search_cache', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$TRUNCATE ONLY public.golfcore_usage$q$, true, 'anon truncate golfcore_usage', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.golfcore_usage','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon REFERENCES golfcore_usage'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon references golfcore_usage', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.golfcore_usage','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon TRIGGER golfcore_usage'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon trigger golfcore_usage', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$TRUNCATE ONLY public.golfcore_usage_drift$q$, true, 'anon truncate golfcore_usage_drift', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.golfcore_usage_drift','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon REFERENCES golfcore_usage_drift'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon references golfcore_usage_drift', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.golfcore_usage_drift','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon TRIGGER golfcore_usage_drift'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon trigger golfcore_usage_drift', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$TRUNCATE ONLY public.operation_receipts$q$, true, 'anon truncate operation_receipts', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.operation_receipts','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon REFERENCES operation_receipts'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon references operation_receipts', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.operation_receipts','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon TRIGGER operation_receipts'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon trigger operation_receipts', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$TRUNCATE ONLY public.published_rounds$q$, true, 'anon truncate published_rounds', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.published_rounds','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon REFERENCES published_rounds'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon references published_rounds', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.published_rounds','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon TRIGGER published_rounds'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon trigger published_rounds', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$TRUNCATE ONLY public.round_messages$q$, true, 'anon truncate round_messages', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.round_messages','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon REFERENCES round_messages'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon references round_messages', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.round_messages','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon TRIGGER round_messages'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon trigger round_messages', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$TRUNCATE ONLY public.share_links$q$, true, 'anon truncate share_links', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.share_links','REFERENCES') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon REFERENCES share_links'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon references share_links', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
SAVEPOINT matrix_case; SELECT pg_temp.probe($q$DO $$ BEGIN IF has_table_privilege(current_user,'public.share_links','TRIGGER') THEN RAISE EXCEPTION 'M2B_UNGUARDED: anon TRIGGER share_links'; ELSE RAISE insufficient_privilege; END IF; END $$$q$, true, 'anon trigger share_links', false); ROLLBACK TO matrix_case; RELEASE matrix_case;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":false}',true);
SAVEPOINT matrix_case;
DELETE FROM public.profiles WHERE id='20000000-0000-0000-0000-000000000002';
CREATE POLICY m2b_test_insert_acl ON public.profiles FOR INSERT TO authenticated WITH CHECK (true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.probe($q$INSERT INTO public.profiles(id) VALUES ('20000000-0000-0000-0000-000000000002')$q$,true,'regular profiles INSERT ACL',false);
ROLLBACK TO matrix_case; RELEASE matrix_case;
RESET ROLE; SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":false,"user_metadata":{"is_anonymous":true}}',true);
SAVEPOINT matrix_case;
SELECT pg_temp.probe($q$INSERT INTO public.contests(owner_id,course,invite_code) VALUES('20000000-0000-0000-0000-000000000001','{}','M2BNEW')$q$,false,'claim user_metadata alone',false);
ROLLBACK TO matrix_case; RELEASE matrix_case;
RESET ROLE; SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":false,"app_metadata":{"is_anonymous":true}}',true);
SAVEPOINT matrix_case;
SELECT pg_temp.probe($q$INSERT INTO public.contests(owner_id,course,invite_code) VALUES('20000000-0000-0000-0000-000000000001','{}','M2BNEW')$q$,false,'claim app_metadata alone',false);
ROLLBACK TO matrix_case; RELEASE matrix_case;
RESET ROLE; SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":false}',true);
SAVEPOINT matrix_case;
SELECT pg_temp.probe($q$INSERT INTO public.contest_players(contest_id,name,handicap,team,group_id) VALUES('30000000-0000-0000-0000-000000000001','Roster',12,'A','group-2')$q$,false,'regular legacy roster insert without user_id',false);
ROLLBACK TO matrix_case; RELEASE matrix_case;
RESET ROLE;
DO $$ BEGIN
 IF (SELECT last_value FROM pg_temp.probe_failures) > 0 THEN
  RAISE EXCEPTION 'M2B_SUITE_FAILED: % labelled probe failures', (SELECT last_value FROM pg_temp.probe_failures);
 END IF;
END $$;
ROLLBACK;
