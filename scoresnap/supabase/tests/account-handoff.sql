BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'AUG84: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.denied(sql text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE sql; EXCEPTION WHEN insufficient_privilege THEN RETURN; END;
 RAISE EXCEPTION 'AUG84 expected denial: %',sql;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.assert(boolean,text),pg_temp.denied(text) TO authenticated,anon;
INSERT INTO auth.users(id) SELECT ('81000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid FROM generate_series(1,4)i;
INSERT INTO public.contests(id,owner_id,course,protocol,sync_enabled,invite_code)
 SELECT ('82000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'81000000-0000-0000-0000-000000000001','{}',1,true,'AUG84'||i FROM generate_series(1,2)i;
INSERT INTO public.contest_players(id,contest_id,name)
 SELECT ('83000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,('82000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'Guest' FROM generate_series(1,2)i;
INSERT INTO public.contest_memberships(contest_id,user_id,role,player_id,status)
 SELECT ('82000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'81000000-0000-0000-0000-000000000002','player',('83000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'approved' FROM generate_series(1,2)i;
INSERT INTO public.contest_memberships(contest_id,user_id,role,status)
 VALUES('82000000-0000-0000-0000-000000000002','81000000-0000-0000-0000-000000000003','viewer','revoked');
INSERT INTO public.contest_rounds(id,contest_id,round_number,name,course_data)
 VALUES('84000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000001',1,'Guest round','{}');
CREATE TEMP TABLE before_counts AS SELECT (SELECT count(*) FROM public.contest_rounds) rounds,(SELECT count(*) FROM public.score_events) scores;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"81000000-0000-0000-0000-000000000002","is_anonymous":true}',true);
SELECT public.prepare_account_handoff(repeat('a',64));
SELECT public.prepare_account_handoff(repeat('a',64));
SELECT pg_temp.denied($q$SELECT public.claim_account_handoff(repeat('a',64),'81000000-0000-0000-0000-000000000002')$q$);
SELECT pg_temp.denied($q$INSERT INTO public.account_round_history VALUES('81000000-0000-0000-0000-000000000002','r1','{"id":"r1"}')$q$);
SELECT set_config('request.jwt.claims','{"sub":"81000000-0000-0000-0000-000000000003","is_anonymous":false}',true);
SELECT pg_temp.denied($q$SELECT public.prepare_account_handoff(repeat('b',64))$q$);
SELECT pg_temp.denied($q$SELECT public.claim_account_handoff(repeat('b',64),'81000000-0000-0000-0000-000000000003')$q$);
SELECT pg_temp.denied($q$SELECT public.claim_account_handoff(repeat('a',64),'81000000-0000-0000-0000-000000000004')$q$);
SELECT pg_temp.assert(public.claim_account_handoff(repeat('a',64),'81000000-0000-0000-0000-000000000003')='{"transferred":1,"conflicts":1}'::jsonb,'claim result');
SELECT pg_temp.assert(public.claim_account_handoff(repeat('a',64),'81000000-0000-0000-0000-000000000003')='{"transferred":1,"conflicts":1}'::jsonb,'idempotent receipt');
INSERT INTO public.account_round_history VALUES('81000000-0000-0000-0000-000000000003','r1','{"id":"r1","scores":[4,5]}');
INSERT INTO public.account_round_history VALUES('81000000-0000-0000-0000-000000000003','r1','{"id":"r1","scores":[3,3]}') ON CONFLICT DO NOTHING;
SELECT pg_temp.assert((SELECT count(*)=1 AND min(snapshot::text)::jsonb->'scores'='[4,5]'::jsonb FROM public.account_round_history),'account history wins duplicate');
SELECT set_config('request.jwt.claims','{"sub":"81000000-0000-0000-0000-000000000004","is_anonymous":false}',true);
SELECT pg_temp.assert((SELECT count(*)=0 FROM public.account_round_history),'history RLS isolation');
SELECT pg_temp.denied($q$INSERT INTO public.account_round_history VALUES('81000000-0000-0000-0000-000000000003','r2','{"id":"r2"}')$q$);
SELECT pg_temp.denied($q$SELECT public.claim_account_handoff(repeat('a',64),'81000000-0000-0000-0000-000000000004')$q$);
RESET ROLE;
SELECT pg_temp.assert((SELECT count(*)=1 FROM public.contest_memberships WHERE user_id='81000000-0000-0000-0000-000000000003' AND status='approved'),'transferred once');
SELECT pg_temp.assert((SELECT status='revoked' FROM public.contest_memberships WHERE user_id='81000000-0000-0000-0000-000000000003' AND contest_id='82000000-0000-0000-0000-000000000002'),'revoked account wins');
SELECT pg_temp.assert((SELECT count(*)=0 FROM public.contest_memberships WHERE user_id='81000000-0000-0000-0000-000000000002' AND status='approved'),'guest access removed');
SELECT pg_temp.assert((SELECT rounds=(SELECT count(*) FROM public.contest_rounds) AND scores=(SELECT count(*) FROM public.score_events) FROM before_counts),'no duplicated rounds or score events');
SELECT pg_temp.assert(NOT has_table_privilege('authenticated','public.account_handoffs','SELECT'),'capability hashes private');
ROLLBACK;
