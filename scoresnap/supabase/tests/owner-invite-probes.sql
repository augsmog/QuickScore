-- Each stage owns and rolls back its fixtures before a migration COMMIT can run.
BEGIN;
INSERT INTO auth.users(id) SELECT ('33110000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid FROM generate_series(1,4)i;
INSERT INTO public.contests(id,owner_id,name,course,protocol,sync_enabled,invite_code,sync_games,sync_game_settings,sync_revision) VALUES
 ('33120000-0000-0000-0000-000000000001','33110000-0000-0000-0000-000000000001','Owner invite fixture','{"name":"Course","holes":[{"num":1,"par":4,"hcp":2,"yards":390}]}',1,true,'HST234','["stroke_play","skins"]','{"betUnit":7,"hasTeams":true,"gameConfig":{"rulesVersion":1}}',1),
 ('33120000-0000-0000-0000-000000000002','33110000-0000-0000-0000-000000000004','Foreign','{}',1,true,'FRN234','[]','{}',0);
-- Default-round trigger allocates a random ID; replace only these fresh fixtures.
DELETE FROM public.contest_rounds WHERE contest_id='33120000-0000-0000-0000-000000000001';
INSERT INTO public.contest_rounds(id,contest_id,round_number,name,date,assignment_revision) VALUES('33130000-0000-0000-0000-000000000001','33120000-0000-0000-0000-000000000001',1,'Round 1','2026-01-01',2);
INSERT INTO public.contest_groups(id,contest_id,round_id,name,sort_order) VALUES('33140000-0000-0000-0000-000000000001','33120000-0000-0000-0000-000000000001','33130000-0000-0000-0000-000000000001','Group 1',0);
INSERT INTO public.contest_players(id,contest_id,name,handicap,team) VALUES('33150000-0000-0000-0000-000000000001','33120000-0000-0000-0000-000000000001','Player',10,'A');
INSERT INTO public.round_player_assignments(contest_id,round_id,player_id,group_id) VALUES('33120000-0000-0000-0000-000000000001','33130000-0000-0000-0000-000000000001','33150000-0000-0000-0000-000000000001','33140000-0000-0000-0000-000000000001');
INSERT INTO public.score_events(contest_id,round_id,player_id,hole,strokes,entered_by,actor,cell_version,contest_revision) VALUES('33120000-0000-0000-0000-000000000001','33130000-0000-0000-0000-000000000001','33150000-0000-0000-0000-000000000001',1,4,'33110000-0000-0000-0000-000000000001','33110000-0000-0000-0000-000000000001',1,1);
INSERT INTO public.sync_id_map(contest_id,kind,local_id,server_id) VALUES('33120000-0000-0000-0000-000000000001','player','local-player','33150000-0000-0000-0000-000000000001');
INSERT INTO public.contest_memberships(contest_id,user_id,role,player_id,status) VALUES('33120000-0000-0000-0000-000000000001','33110000-0000-0000-0000-000000000002','player','33150000-0000-0000-0000-000000000001','approved');
SELECT pg_temp.aug331_assert(NOT has_function_privilege('anon','public.fetch_snapshot(uuid,bigint)','EXECUTE') AND has_function_privilege('authenticated','public.fetch_snapshot(uuid,bigint)','EXECUTE') AND has_function_privilege('service_role','public.fetch_snapshot(uuid,bigint)','EXECUTE'), 'RPC_ACL');
SELECT pg_temp.aug331_assert(NOT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.fetch_snapshot(uuid,bigint)'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE'), 'PUBLIC_EXECUTE');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"33110000-0000-0000-0000-000000000001","is_anonymous":false,"role":"authenticated"}';
SELECT pg_temp.aug331_assert(NOT EXISTS(SELECT 1 FROM public.contests WHERE id='33120000-0000-0000-0000-000000000001'), 'RESTRICTIVE_TABLE_RLS');
SELECT public.fetch_snapshot('33120000-0000-0000-0000-000000000001') AS owner_payload \gset
SELECT pg_temp.aug331_assert((:'owner_payload'::jsonb ? 'invite_code')=:'expect_invite'::boolean, 'OWNER_INVITE_PRESENCE');
SELECT pg_temp.aug331_assert(:'owner_payload'::jsonb->'games'='["stroke_play","skins"]'::jsonb AND :'owner_payload'::jsonb->'game_settings'->>'betUnit'='7' AND :'owner_payload'::jsonb->'rounds'->0->'players'->0->'cells'->0->>'strokes'='4' AND :'owner_payload'::jsonb->'id_map'->0->>'local_id'='local-player', 'NONEMPTY_NESTED_FIXTURE');
\if :capture_predecessor
SELECT :'owner_payload'::jsonb AS predecessor_payload \gset
\else
SELECT pg_temp.aug331_assert((:'owner_payload'::jsonb - 'invite_code')=:'predecessor_payload'::jsonb, 'UNCHANGED_PREDECESSOR_PAYLOAD');
\endif
SELECT pg_temp.aug331_denied($q$SELECT public.fetch_snapshot('33120000-0000-0000-0000-000000000001',-1)$q$,'22023');
SELECT pg_temp.aug331_denied($q$SELECT public.fetch_snapshot('33120000-0000-0000-0000-000000000001',NULL)$q$,'22023');
SELECT pg_temp.aug331_denied($q$SELECT public.fetch_snapshot('33120000-0000-0000-0000-000000000001',999)$q$,'22023');
SELECT pg_temp.aug331_denied($q$SELECT public.fetch_snapshot('33120000-0000-0000-0000-000000000002')$q$,'42501');
SELECT pg_temp.aug331_denied($q$SELECT public.fetch_snapshot('33120000-0000-0000-0000-000000000099')$q$,'42501');
\if :expect_invite
SELECT pg_temp.aug331_assert(:'owner_payload'::jsonb->>'invite_code'='HST234', 'CANONICAL_OWNER_CODE');
SELECT :'owner_payload'::jsonb->>'invite_code' AS canonical_code \gset
SET LOCAL request.jwt.claims='{"sub":"33110000-0000-0000-0000-000000000003","is_anonymous":false,"role":"authenticated"}';
SELECT pg_temp.aug331_assert(public.request_join(' '||lower(:'canonical_code')||' ','Guest probe')='{"status":"pending"}'::jsonb, 'JOIN_PENDING_SHAPE');
RESET ROLE;
-- Generic pending alone is NOT evidence that the canonical code finds this round.
SELECT pg_temp.aug331_assert((SELECT count(*)=1 AND bool_and(contest_id='33120000-0000-0000-0000-000000000001'::uuid) FROM public.contest_join_requests WHERE requester='33110000-0000-0000-0000-000000000003'), 'CANONICAL_CODE_JOIN_TARGET');
\endif
RESET ROLE;
UPDATE public.contest_memberships SET role='player' WHERE contest_id='33120000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"33110000-0000-0000-0000-000000000002","is_anonymous":false,"role":"authenticated"}';
SELECT pg_temp.aug331_assert(public.fetch_snapshot('33120000-0000-0000-0000-000000000001')=:'predecessor_payload'::jsonb, 'NONOWNER_PLAYER_PAYLOAD');
SELECT pg_temp.aug331_assert(NOT(public.fetch_snapshot('33120000-0000-0000-0000-000000000001') ? 'invite_code'), 'NONOWNER_CODE_LEAK');
RESET ROLE;
UPDATE public.contest_memberships SET role='scorer' WHERE contest_id='33120000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"33110000-0000-0000-0000-000000000002","is_anonymous":false,"role":"authenticated"}';
SELECT pg_temp.aug331_assert(public.fetch_snapshot('33120000-0000-0000-0000-000000000001')=:'predecessor_payload'::jsonb, 'NONOWNER_SCORER_PAYLOAD');
SELECT pg_temp.aug331_assert(NOT(public.fetch_snapshot('33120000-0000-0000-0000-000000000001') ? 'invite_code'), 'NONOWNER_CODE_LEAK');
RESET ROLE;
UPDATE public.contest_memberships SET role='viewer' WHERE contest_id='33120000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"33110000-0000-0000-0000-000000000002","is_anonymous":false,"role":"authenticated"}';
SELECT pg_temp.aug331_assert(public.fetch_snapshot('33120000-0000-0000-0000-000000000001')=:'predecessor_payload'::jsonb, 'NONOWNER_VIEWER_PAYLOAD');
SELECT pg_temp.aug331_assert(NOT(public.fetch_snapshot('33120000-0000-0000-0000-000000000001') ? 'invite_code'), 'NONOWNER_CODE_LEAK');
RESET ROLE;
UPDATE public.contest_memberships SET role='host' WHERE contest_id='33120000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"33110000-0000-0000-0000-000000000002","is_anonymous":false,"role":"authenticated"}';
SELECT pg_temp.aug331_assert(public.fetch_snapshot('33120000-0000-0000-0000-000000000001')=:'predecessor_payload'::jsonb, 'NONOWNER_HOST_PAYLOAD');
SELECT pg_temp.aug331_assert(NOT(public.fetch_snapshot('33120000-0000-0000-0000-000000000001') ? 'invite_code'), 'NONOWNER_CODE_LEAK');
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"33110000-0000-0000-0000-000000000002","is_anonymous":true,"role":"authenticated"}';
SELECT pg_temp.aug331_assert(public.fetch_snapshot('33120000-0000-0000-0000-000000000001')=:'predecessor_payload'::jsonb, 'ANONYMOUS_MEMBER_PAYLOAD');
SET LOCAL request.jwt.claims='{"sub":"33110000-0000-0000-0000-000000000001","is_anonymous":true,"role":"authenticated"}';
SELECT pg_temp.aug331_denied($q$SELECT public.fetch_snapshot('33120000-0000-0000-0000-000000000001')$q$,'42501');
RESET ROLE;
INSERT INTO public.contest_memberships(contest_id,user_id,role,status) VALUES('33120000-0000-0000-0000-000000000001','33110000-0000-0000-0000-000000000001','host','approved');
SET LOCAL ROLE authenticated;
SELECT pg_temp.aug331_assert(public.fetch_snapshot('33120000-0000-0000-0000-000000000001')=:'predecessor_payload'::jsonb, 'ANONYMOUS_OWNER_MEMBERSHIP_PAYLOAD');
SET LOCAL request.jwt.claims='{"sub":"33110000-0000-0000-0000-000000000003","is_anonymous":false,"role":"authenticated"}';
SELECT pg_temp.aug331_denied($q$SELECT public.fetch_snapshot('33120000-0000-0000-0000-000000000001')$q$,'42501');
SET LOCAL request.jwt.claims='{}';
SELECT pg_temp.aug331_denied($q$SELECT public.fetch_snapshot('33120000-0000-0000-0000-000000000001')$q$,'42501');
RESET ROLE;
UPDATE public.contest_memberships SET status='revoked' WHERE contest_id='33120000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"33110000-0000-0000-0000-000000000002","is_anonymous":false,"role":"authenticated"}';
SELECT pg_temp.aug331_denied($q$SELECT public.fetch_snapshot('33120000-0000-0000-0000-000000000001')$q$,'42501');
SET LOCAL ROLE anon;
SET LOCAL request.jwt.claims='{"sub":"33110000-0000-0000-0000-000000000001","is_anonymous":false,"role":"authenticated"}';
SELECT pg_temp.aug331_denied($q$SELECT public.fetch_snapshot('33120000-0000-0000-0000-000000000001')$q$,'42501');
SET LOCAL ROLE service_role;
SET LOCAL request.jwt.claims='{}';
SELECT pg_temp.aug331_denied($q$SELECT public.fetch_snapshot('33120000-0000-0000-0000-000000000001')$q$,'42501');
SET LOCAL request.jwt.claims='{"sub":"33110000-0000-0000-0000-000000000003","is_anonymous":false,"role":"service_role"}';
SELECT pg_temp.aug331_denied($q$SELECT public.fetch_snapshot('33120000-0000-0000-0000-000000000001')$q$,'42501');
RESET ROLE;
UPDATE public.contests SET sync_enabled=false WHERE id='33120000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"33110000-0000-0000-0000-000000000001","is_anonymous":false,"role":"authenticated"}';
SELECT pg_temp.aug331_assert(public.fetch_snapshot('33120000-0000-0000-0000-000000000001')->'capabilities'->>'enabled'='false', 'PAUSED_READABLE');
RESET ROLE;
UPDATE public.contests SET sync_enabled=true,status='completed' WHERE id='33120000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT pg_temp.aug331_assert(public.fetch_snapshot('33120000-0000-0000-0000-000000000001')->>'completed'='true' AND public.fetch_snapshot('33120000-0000-0000-0000-000000000001')->'capabilities'->>'enabled'='false', 'COMPLETED_READABLE');
RESET ROLE;
\if :expect_invite
UPDATE public.contests SET status='active' WHERE id='33120000-0000-0000-0000-000000000001';
UPDATE public.contest_memberships SET status='approved' WHERE contest_id='33120000-0000-0000-0000-000000000001';
CREATE OR REPLACE FUNCTION pg_temp.aug331_privacy_mutant() RETURNS void LANGUAGE plpgsql AS $$
DECLARE original text; mutated text;
BEGIN
 BEGIN
  original := pg_get_functiondef('public.fetch_snapshot(uuid,bigint)'::regprocedure);
  mutated := replace(original,$needle$IF c.owner_id=auth.uid() AND NOT coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN$needle$,'IF true THEN');
  PERFORM pg_temp.aug331_assert(mutated<>original,'PRIVACY_MUTATION_APPLIED');
  EXECUTE mutated;
  PERFORM set_config('request.jwt.claims','{"sub":"33110000-0000-0000-0000-000000000002","is_anonymous":false,"role":"authenticated"}',true);
  PERFORM pg_temp.aug331_assert(NOT(public.fetch_snapshot('33120000-0000-0000-0000-000000000001') ? 'invite_code'),'NONOWNER_CODE_LEAK');
  RAISE EXCEPTION 'AUG331_ASSERT: privacy mutant unexpectedly passed';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'AUG331_ASSERT: NONOWNER_CODE_LEAK' THEN RAISE; END IF;
 END;
END $$;
SELECT pg_temp.aug331_privacy_mutant();
\echo PASS: AUG331 privacy mutant rejected
\endif
ROLLBACK;
\echo PASS: AUG331 fixture transaction rolled back for :stage
