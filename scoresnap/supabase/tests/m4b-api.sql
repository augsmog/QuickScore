BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'M4B_ASSERT: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.denied(sql text, state text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE sql; EXCEPTION WHEN OTHERS THEN
 IF SQLSTATE=state THEN RETURN; END IF; RAISE; END;
 RAISE EXCEPTION 'M4B_ASSERT: expected % for %',state,sql;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.assert(boolean,text),pg_temp.denied(text,text) TO authenticated,anon;
INSERT INTO auth.users(id) SELECT ('41000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid FROM generate_series(1,4)i;
INSERT INTO public.contests(id,owner_id,course,protocol,sync_enabled,invite_code)
VALUES('42000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001','{"private":"LOCATION_SENTINEL"}',1,true,'M4BAPI');
-- Seed the legacy publication before enrollment; enrolled uploads stay blocked.
UPDATE public.contests SET protocol=0,sync_enabled=false WHERE id='42000000-0000-0000-0000-000000000001';
INSERT INTO public.published_rounds(contest_id,owner_id,local_id,snapshot) VALUES('42000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001','m4b-published','{"players":[],"games":[]}');
UPDATE public.contests SET protocol=1,sync_enabled=true WHERE id='42000000-0000-0000-0000-000000000001';
INSERT INTO public.contests(id,owner_id,course,invite_code) VALUES('42000000-0000-0000-0000-000000000002','41000000-0000-0000-0000-000000000001','{}','M4BENR');
INSERT INTO public.contest_players(id,contest_id,name) VALUES('43000000-0000-0000-0000-000000000001','42000000-0000-0000-0000-000000000001','Player');
INSERT INTO public.contest_memberships(contest_id,user_id,role,player_id,status) VALUES('42000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000002','player','43000000-0000-0000-0000-000000000001','approved');
UPDATE public.contests SET course='{"name":"Course One","holes":[{"num":1,"par":4,"hcp":3,"yards":{"secret":"COURSE_SECRET"},"private":"COURSE_SECRET"}],"location":"COURSE_SECRET"}' WHERE id='42000000-0000-0000-0000-000000000001';
INSERT INTO public.contest_rounds(id,contest_id,round_number,name,course_data) VALUES('45000000-0000-0000-0000-000000000002','42000000-0000-0000-0000-000000000001',2,'Away','{"name":"Course Two","holes":[{"num":1,"par":5,"hcp":1,"yards":510}]}');
INSERT INTO public.contest_groups(id,contest_id,round_id,name) VALUES('46000000-0000-0000-0000-000000000002','42000000-0000-0000-0000-000000000001','45000000-0000-0000-0000-000000000002','Second group');
INSERT INTO public.round_player_assignments(contest_id,round_id,player_id,group_id) VALUES('42000000-0000-0000-0000-000000000001','45000000-0000-0000-0000-000000000002','43000000-0000-0000-0000-000000000001','46000000-0000-0000-0000-000000000002');
INSERT INTO public.sync_id_map(contest_id,kind,local_id,server_id) VALUES('42000000-0000-0000-0000-000000000001','player','local-player','43000000-0000-0000-0000-000000000001');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"41000000-0000-0000-0000-000000000002","is_anonymous":true,"role":"authenticated"}';
SELECT pg_temp.denied($q$SELECT public.enroll_contest('42000000-0000-0000-0000-000000000002',0)$q$,'42501');
SELECT pg_temp.assert(jsonb_array_length(public.my_sync_status()->'memberships')=1 AND public.my_sync_status()->'memberships'->0->>'player_id'='43000000-0000-0000-0000-000000000001','own membership discovery');
SELECT pg_temp.assert(public.fetch_snapshot('42000000-0000-0000-0000-000000000001')->'capabilities'=public.sync_capabilities('42000000-0000-0000-0000-000000000001'),'snapshot handshake');
SELECT pg_temp.assert(public.sync_capabilities('42000000-0000-0000-0000-000000000001')->>'enabled'='true','authorized capabilities');
RESET ROLE;
UPDATE public.contests SET sync_enabled=false WHERE id='42000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert(public.sync_capabilities('42000000-0000-0000-0000-000000000001')->>'enabled'='false' AND public.fetch_snapshot('42000000-0000-0000-0000-000000000001')->'capabilities'->>'enabled'='false','server pause handshake');
RESET ROLE;
UPDATE public.contests SET sync_enabled=true WHERE id='42000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert(public.fetch_snapshot('42000000-0000-0000-0000-000000000001')->>'revision'='0','approved snapshot');
SELECT pg_temp.assert(public.fetch_snapshot('42000000-0000-0000-0000-000000000001')::text NOT LIKE '%SENTINEL%','private course absent');
SELECT pg_temp.assert(public.fetch_snapshot('42000000-0000-0000-0000-000000000001') ?& ARRAY['course','id_map','contest_id'],'snapshot metadata');
SELECT pg_temp.assert(public.fetch_snapshot('42000000-0000-0000-0000-000000000001')->'rounds'->0->'course'->>'name'='Course One' AND public.fetch_snapshot('42000000-0000-0000-0000-000000000001')->'rounds'->1->'course'->'holes'->0->>'par'='5','per-round course fallback and override');
SELECT pg_temp.assert(public.fetch_snapshot('42000000-0000-0000-0000-000000000001')::text NOT LIKE '%COURSE_SECRET%','course extensions stripped');
SELECT pg_temp.assert(public.fetch_snapshot('42000000-0000-0000-0000-000000000001')->'id_map'->0->>'local_id'='local-player' AND public.fetch_snapshot('42000000-0000-0000-0000-000000000001')->'rounds'->1->'players'->0->>'group_id'='46000000-0000-0000-0000-000000000002','stable mapping and assignment');
SELECT pg_temp.assert(public.sync_capabilities('42000000-0000-0000-0000-000000000001')->'channel'='{"topic":"snapscore:42000000-0000-0000-0000-000000000001","private":true,"event":"revision"}'::jsonb,'frozen channel');
SELECT pg_temp.assert(public.can_receive_sync('snapscore:42000000-0000-0000-0000-000000000001') AND NOT public.can_receive_sync('snapscore:42000000-0000-0000-0000-000000000002') AND NOT public.can_receive_sync('private:snapscore:42000000-0000-0000-0000-000000000001'),'exact authorized topic');
SELECT pg_temp.assert(public.submit_score('42000000-0000-0000-0000-000000000001',NULL,'43000000-0000-0000-0000-000000000001',1,'set',4,0,'44000000-0000-0000-0000-000000000001','immutable',0)->>'status'='accepted','first write');
SELECT pg_temp.assert(public.submit_score('42000000-0000-0000-0000-000000000001',NULL,'43000000-0000-0000-0000-000000000001',1,'set',4,0,'44000000-0000-0000-0000-000000000001','immutable',0)->>'status'='accepted','replay precedes revision CAS');
SELECT pg_temp.denied($q$SELECT public.submit_score('42000000-0000-0000-0000-000000000001',NULL,'43000000-0000-0000-0000-000000000001',1,'set',5,0,'44000000-0000-0000-0000-000000000001','immutable',0)$q$,'22023');
SELECT pg_temp.assert(public.submit_score('42000000-0000-0000-0000-000000000001',NULL,'43000000-0000-0000-0000-000000000001',2,'set',5,0,'44000000-0000-0000-0000-000000000002','immutable',0)->>'status'='conflict','event revision CAS');
SELECT pg_temp.assert(public.write_score('42000000-0000-0000-0000-000000000001',NULL,'43000000-0000-0000-0000-000000000001',1,'clear',NULL,1,'44000000-0000-0000-0000-000000000003','immutable')->>'version'='2','clear tombstone');
SELECT pg_temp.assert(public.fetch_snapshot('42000000-0000-0000-0000-000000000001')->'rounds'->0->'players'->0->'cells'->0->>'version'='2','fetch tombstone version');
SELECT pg_temp.denied($q$SELECT public.fetch_snapshot('42000000-0000-0000-0000-000000000001',99)$q$,'22023');
UPDATE public.contest_players SET scores=ARRAY[9] WHERE id='43000000-0000-0000-0000-000000000001';
\if :m4b_native
SET LOCAL realtime.topic='snapscore:42000000-0000-0000-0000-000000000001';
SELECT pg_temp.assert((SELECT count(*)=2 FROM realtime.messages),'private revision receive');
SELECT pg_temp.denied($q$INSERT INTO realtime.messages(payload) VALUES('{}')$q$,'42501');
\endif
RESET ROLE;
SELECT pg_temp.assert((SELECT count(*)=2 FROM public.score_events WHERE contest_id='42000000-0000-0000-0000-000000000001'),'one event per accepted op');
SELECT pg_temp.assert((SELECT snapshot->'players'->0->'scores'->>0='0' FROM public.published_rounds WHERE local_id='m4b-published'),'atomic published cache clear');
SELECT pg_temp.assert((SELECT scores[1]=0 FROM public.contest_players WHERE id='43000000-0000-0000-0000-000000000001'),'atomic cache clear');
\if :m4b_native
SELECT pg_temp.assert((SELECT bool_and(private AND payload=jsonb_build_object('revision',(payload->>'revision')::bigint)) FROM realtime.messages),'revision-only private payload');
\endif
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"41000000-0000-0000-0000-000000000003","is_anonymous":true,"role":"authenticated"}';
SELECT pg_temp.assert(public.request_join('M4BAPI','Recovery')='{"status":"pending"}'::jsonb,'generic pending');
SELECT pg_temp.assert(jsonb_array_length(public.my_sync_status()->'memberships')=0 AND jsonb_array_length(public.my_sync_status()->'requests')=1 AND public.my_sync_status()->'requests'->0->'contest_id'='null'::jsonb,'pending own request without locator');
SELECT pg_temp.denied($q$SELECT public.sync_capabilities('42000000-0000-0000-0000-000000000001')$q$,'42501');
SELECT pg_temp.denied($q$SELECT public.fetch_snapshot('42000000-0000-0000-0000-000000000001')$q$,'42501');
\if :m4b_native
SELECT pg_temp.assert((SELECT count(*)=0 FROM realtime.messages),'outsider receives no hints');
\endif
SELECT pg_temp.denied($q$SELECT public.list_join_requests('42000000-0000-0000-0000-000000000001')$q$,'42501');
RESET ROLE;
SELECT set_config('m4b.request',(SELECT id::text FROM public.contest_join_requests WHERE requester='41000000-0000-0000-0000-000000000003'),true);
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"41000000-0000-0000-0000-000000000001","is_anonymous":false,"role":"authenticated"}';
SELECT pg_temp.assert(public.enroll_contest('42000000-0000-0000-0000-000000000002',0)->>'protocol'='1','explicit empty enrollment');
SELECT pg_temp.denied($q$SELECT public.publish_shared_round('m4b-published','{"players":[],"games":[]}')$q$,'55000');
SELECT public.decide_join_request(current_setting('m4b.request')::uuid,true,'43000000-0000-0000-0000-000000000001');
SET LOCAL request.jwt.claims='{"sub":"41000000-0000-0000-0000-000000000002","is_anonymous":true,"role":"authenticated"}';
SELECT pg_temp.denied($q$SELECT public.fetch_snapshot('42000000-0000-0000-0000-000000000001')$q$,'42501');
SELECT pg_temp.denied($q$SELECT public.submit_score('42000000-0000-0000-0000-000000000001',NULL,'43000000-0000-0000-0000-000000000001',1,'set',4,0,'44000000-0000-0000-0000-000000000001','immutable',0)$q$,'42501');
SET LOCAL request.jwt.claims='{"sub":"41000000-0000-0000-0000-000000000003","is_anonymous":true,"role":"authenticated"}';
SELECT pg_temp.assert(public.my_sync_status()->'memberships'->0->>'status'='approved' AND public.my_sync_status()->'requests'->0->>'contest_id'='42000000-0000-0000-0000-000000000001','new phone discovers approval');
SET LOCAL request.jwt.claims='{"sub":"41000000-0000-0000-0000-000000000001","is_anonymous":false,"role":"authenticated"}';
SELECT public.revoke_membership('42000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000003');
SET LOCAL request.jwt.claims='{"sub":"41000000-0000-0000-0000-000000000003","is_anonymous":true,"role":"authenticated"}';
SELECT pg_temp.denied($q$SELECT public.fetch_snapshot('42000000-0000-0000-0000-000000000001')$q$,'42501');
SELECT pg_temp.assert(public.my_sync_status()->'memberships'->0->>'status'='revoked' AND public.my_sync_status()->'requests'->0->'contest_id'='null'::jsonb,'own revoked status');
SET LOCAL request.jwt.claims='{"sub":"41000000-0000-0000-0000-000000000004","is_anonymous":false,"role":"authenticated"}';
SELECT pg_temp.assert(public.my_sync_status()='{"api_version":1,"memberships":[],"requests":[]}'::jsonb,'outsider discovers nothing');
-- A real signed-in non-member (anonymous Auth is OFF live) gets no snapshot or payload.
DO $$ BEGIN
 PERFORM public.fetch_snapshot('42000000-0000-0000-0000-000000000001');
 RAISE EXCEPTION 'M4B_ASSERT: signed-in outsider fetched snapshot';
EXCEPTION WHEN insufficient_privilege THEN
 IF SQLERRM <> 'FORBIDDEN' THEN RAISE EXCEPTION 'M4B_ASSERT: expected FORBIDDEN, got %',SQLERRM; END IF;
END $$;
\if :m4b_native
SELECT pg_temp.assert((SELECT count(*)=0 FROM realtime.messages),'signed-in non-member receives no realtime payload');
\endif
SET LOCAL request.jwt.claims='{}';
SELECT pg_temp.denied('SELECT public.my_sync_status()','42501');
RESET ROLE;
SELECT pg_temp.assert(public.sanitize_shared_round('{"players":[],"games":[{"game":"private","standings":[{"displayName":"Player","units":999}]}]}')->'games'='[]'::jsonb,'legacy spectator games stripped');
DO $$ DECLARE t text; p text; r text; BEGIN
 FOREACH t IN ARRAY ARRAY['contest_memberships','contest_join_requests','operation_receipts','contest_rounds','contest_groups','round_player_assignments','round_scorer_scopes','group_submissions','sync_id_map'] LOOP
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
 FOREACH p IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
 IF has_table_privilege(r,'public.'||t,p) THEN RAISE EXCEPTION 'M4B_ASSERT: unsafe ACL % % %',r,t,p; END IF;
 END LOOP; END LOOP; END LOOP;
 FOREACH t IN ARRAY ARRAY['sync_score_cache()','sync_revision_hint()','sync_legacy_projection(uuid)','sync_course(jsonb)'] LOOP
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
 IF has_function_privilege(r,'public.'||t,'EXECUTE') THEN RAISE EXCEPTION 'M4B_ASSERT: helper ACL % %',r,t; END IF;
 END LOOP; END LOOP;
 FOREACH t IN ARRAY ARRAY['submit_score(uuid,uuid,uuid,integer,text,integer,bigint,uuid,text,bigint)','fetch_snapshot(uuid,bigint)','revoke_membership(uuid,uuid)','enroll_contest(uuid,bigint)','sync_capabilities(uuid)','my_sync_status()','can_receive_sync(text)'] LOOP
 IF has_function_privilege('anon','public.'||t,'EXECUTE') OR NOT has_function_privilege('authenticated','public.'||t,'EXECUTE') THEN RAISE EXCEPTION 'M4B_ASSERT: RPC ACL %',t; END IF;
 END LOOP;
END $$;
ROLLBACK;
