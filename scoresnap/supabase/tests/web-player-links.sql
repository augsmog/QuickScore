-- Disposable database only. Runs inside one transaction and rolls back.
-- Tests supabase/proposed/20261128000000_web_player_links.sql: a web guest with a
-- player link joins with no approval and keeps the card for one group, and only that group.
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'WEBLINK_ASSERT: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.denied(sql text, state text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE sql; EXCEPTION WHEN OTHERS THEN
 IF SQLSTATE=state THEN RETURN; END IF; RAISE; END;
 RAISE EXCEPTION 'WEBLINK_ASSERT: expected % for %',state,sql;
END $$;
CREATE TEMP TABLE t(k text PRIMARY KEY, v text);
GRANT ALL ON t TO authenticated, anon;
GRANT EXECUTE ON FUNCTION pg_temp.assert(boolean,text),pg_temp.denied(text,text) TO authenticated,anon;

-- host=1, web guest A=2, web guest B=3, host-approved player=4, stranger=5
INSERT INTO auth.users(id) SELECT ('51000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid FROM generate_series(1,5)i;
INSERT INTO public.contests(id,owner_id,name,course,protocol,sync_enabled,invite_code,bet_unit)
VALUES('52000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000001','Saturday foursome','{"name":"Course","holes":[{"num":1,"par":4,"hcp":1,"yards":400}]}',1,true,'WEBLNK',5);
INSERT INTO public.contests(id,owner_id,name,course,protocol,sync_enabled,invite_code)
VALUES('52000000-0000-0000-0000-000000000002','51000000-0000-0000-0000-000000000001','Other round','{}',1,true,'OTHERR');
-- Round 1 is created with the contest; give it a fixed id for the assertions below.
UPDATE public.contest_rounds SET id='55000000-0000-0000-0000-000000000001' WHERE contest_id='52000000-0000-0000-0000-000000000001' AND round_number=1;
INSERT INTO public.contest_groups(id,contest_id,round_id,name,sort_order) VALUES
 ('56000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000001','55000000-0000-0000-0000-000000000001','Group A',1),
 ('56000000-0000-0000-0000-000000000002','52000000-0000-0000-0000-000000000001','55000000-0000-0000-0000-000000000001','Group B',2);
INSERT INTO public.contest_players(id,contest_id,name,handicap,sort_order) VALUES
 ('53000000-0000-0000-0000-000000000001','52000000-0000-0000-0000-000000000001','Matt',7,1),
 ('53000000-0000-0000-0000-000000000002','52000000-0000-0000-0000-000000000001','Augie',12,2),
 ('53000000-0000-0000-0000-000000000003','52000000-0000-0000-0000-000000000001','Chris',18,3),
 ('53000000-0000-0000-0000-000000000004','52000000-0000-0000-0000-000000000001','Dave',22,4);
INSERT INTO public.round_player_assignments(contest_id,round_id,player_id,group_id) VALUES
 ('52000000-0000-0000-0000-000000000001','55000000-0000-0000-0000-000000000001','53000000-0000-0000-0000-000000000001','56000000-0000-0000-0000-000000000001'),
 ('52000000-0000-0000-0000-000000000001','55000000-0000-0000-0000-000000000001','53000000-0000-0000-0000-000000000002','56000000-0000-0000-0000-000000000001'),
 ('52000000-0000-0000-0000-000000000001','55000000-0000-0000-0000-000000000001','53000000-0000-0000-0000-000000000003','56000000-0000-0000-0000-000000000002'),
 ('52000000-0000-0000-0000-000000000001','55000000-0000-0000-0000-000000000001','53000000-0000-0000-0000-000000000004','56000000-0000-0000-0000-000000000002');
INSERT INTO public.contest_memberships(contest_id,user_id,role,player_id,status) VALUES('52000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000004','player','53000000-0000-0000-0000-000000000004','approved');
SET LOCAL ROLE authenticated;

-- 1. Only the signed-in host can make a link.
SET LOCAL request.jwt.claims='{"sub":"51000000-0000-0000-0000-000000000002","is_anonymous":true,"role":"authenticated"}';
SELECT pg_temp.denied($q$SELECT public.create_player_link('52000000-0000-0000-0000-000000000001')$q$,'42501');
SET LOCAL request.jwt.claims='{"sub":"51000000-0000-0000-0000-000000000001","is_anonymous":true,"role":"authenticated"}';
SELECT pg_temp.denied($q$SELECT public.create_player_link('52000000-0000-0000-0000-000000000001')$q$,'42501');
SET LOCAL request.jwt.claims='{"sub":"51000000-0000-0000-0000-000000000001","is_anonymous":false,"role":"authenticated"}';
INSERT INTO t SELECT 'token', public.create_player_link('52000000-0000-0000-0000-000000000001');
SELECT pg_temp.assert((SELECT v ~ '^[a-f0-9]{64}$' FROM t WHERE k='token'),'token is 64 hex');
RESET ROLE;
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM public.player_links l, t WHERE t.k='token' AND l.token_hash=t.v),'raw token is not stored');
SET LOCAL ROLE authenticated;

-- 2. A guest with the link sees names only and joins with no approval.
SET LOCAL request.jwt.claims='{"sub":"51000000-0000-0000-0000-000000000002","is_anonymous":true,"role":"authenticated"}';
SELECT pg_temp.denied($q$SELECT public.player_link_roster(repeat('0',64))$q$,'22023');
SELECT pg_temp.denied($q$SELECT public.player_link_roster('not-a-token')$q$,'22023');
SELECT pg_temp.denied($q$SELECT public.fetch_snapshot('52000000-0000-0000-0000-000000000001')$q$,'42501');
INSERT INTO t SELECT 'roster', public.player_link_roster(v)::text FROM t WHERE k='token';
SELECT pg_temp.assert((SELECT v::jsonb->'me'='null'::jsonb FROM t WHERE k='roster'),'a guest who has not joined has no player yet');
SELECT pg_temp.assert((SELECT v::jsonb->>'name'='Saturday foursome' AND v::jsonb->>'open'='true'
  AND jsonb_array_length(v::jsonb->'rounds'->0->'groups')=2
  AND v::jsonb->'rounds'->0->'groups'->0->'players'->0->>'displayName'='Matt'
  AND v::jsonb->'rounds'->0->'groups'->1->'players'->1->>'displayName'='Dave' FROM t WHERE k='roster'),'roster lists groups and names');
SELECT pg_temp.assert((SELECT v NOT LIKE '%handicap%' AND v NOT LIKE '%WEBLNK%' AND v NOT LIKE '%bet%' FROM t WHERE k='roster'),'roster has no handicap, invite code or money');
SELECT pg_temp.denied(format($q$SELECT public.join_player_link(%L,'53000000-0000-0000-0000-0000000000ff')$q$,(SELECT v FROM t WHERE k='token')),'22023');
SELECT pg_temp.assert((SELECT public.join_player_link(v,'53000000-0000-0000-0000-000000000001')->>'status' FROM t WHERE k='token')='joined','guest A joins as Matt');
SELECT pg_temp.assert((SELECT public.player_link_roster(v)->>'me' FROM t WHERE k='token')='53000000-0000-0000-0000-000000000001','returning guest is told which player they picked');
SELECT pg_temp.assert(public.my_sync_status()->'memberships'->0->>'role'='scorer' AND public.my_sync_status()->'memberships'->0->>'status'='approved','guest A is an approved scorer');
SELECT pg_temp.assert(public.fetch_snapshot('52000000-0000-0000-0000-000000000001')->>'name'='Saturday foursome','guest A can read the round');
SELECT pg_temp.assert(NOT (public.fetch_snapshot('52000000-0000-0000-0000-000000000001') ? 'invite_code'),'guest never receives the invite code');

-- 3. Guest A keeps the card for the whole of Group A (own player and partner), not Group B.
SELECT pg_temp.assert(public.write_score('52000000-0000-0000-0000-000000000001','55000000-0000-0000-0000-000000000001','53000000-0000-0000-0000-000000000001',1,'set',4,0,'61000000-0000-0000-0000-000000000001','a')->>'status'='accepted','scores own player');
SELECT pg_temp.assert(public.write_score('52000000-0000-0000-0000-000000000001','55000000-0000-0000-0000-000000000001','53000000-0000-0000-0000-000000000002',1,'set',5,0,'61000000-0000-0000-0000-000000000002','b')->>'status'='accepted','scores group partner');
SELECT pg_temp.denied($q$SELECT public.write_score('52000000-0000-0000-0000-000000000001','55000000-0000-0000-0000-000000000001','53000000-0000-0000-0000-000000000003',1,'set',6,0,'61000000-0000-0000-0000-000000000003','c')$q$,'42501');
SELECT pg_temp.denied($q$SELECT public.create_player_link('52000000-0000-0000-0000-000000000001')$q$,'42501');
SELECT pg_temp.denied($q$SELECT public.revoke_player_links('52000000-0000-0000-0000-000000000001')$q$,'42501');
SELECT pg_temp.denied($q$SELECT public.fetch_snapshot('52000000-0000-0000-0000-000000000002')$q$,'42501');

-- 4. The host sees the guest's scores; a second guest may keep the same card.
SET LOCAL request.jwt.claims='{"sub":"51000000-0000-0000-0000-000000000001","is_anonymous":false,"role":"authenticated"}';
SELECT pg_temp.assert(public.fetch_snapshot('52000000-0000-0000-0000-000000000001')->'rounds'->0->'players'->1->'cells'->0->>'strokes'='5','host sees the web score');
SELECT pg_temp.denied(format($q$SELECT public.join_player_link(%L,'53000000-0000-0000-0000-000000000001')$q$,(SELECT v FROM t WHERE k='token')),'22023');
SET LOCAL request.jwt.claims='{"sub":"51000000-0000-0000-0000-000000000003","is_anonymous":true,"role":"authenticated"}';
SELECT pg_temp.assert((SELECT public.join_player_link(v,'53000000-0000-0000-0000-000000000001')->>'status' FROM t WHERE k='token')='joined','guest B also joins as Matt');
SELECT pg_temp.assert(public.write_score('52000000-0000-0000-0000-000000000001','55000000-0000-0000-0000-000000000001','53000000-0000-0000-0000-000000000001',1,'set',3,0,'61000000-0000-0000-0000-000000000004','d')->>'status'='conflict','stale second card is told of the conflict, not silently applied');
-- Choosing again moves guest B to the other group and out of the first.
SELECT pg_temp.assert((SELECT public.join_player_link(v,'53000000-0000-0000-0000-000000000003')->>'status' FROM t WHERE k='token')='joined','guest B re-picks Chris');
SELECT pg_temp.assert(public.write_score('52000000-0000-0000-0000-000000000001','55000000-0000-0000-0000-000000000001','53000000-0000-0000-0000-000000000003',1,'set',6,0,'61000000-0000-0000-0000-000000000005','e')->>'status'='accepted','guest B scores Group B');
SELECT pg_temp.denied($q$SELECT public.write_score('52000000-0000-0000-0000-000000000001','55000000-0000-0000-0000-000000000001','53000000-0000-0000-0000-000000000002',1,'set',6,1,'61000000-0000-0000-0000-000000000006','f')$q$,'42501');

-- 5. A host-approved player keeps their own binding; the link does not rewrite it.
SET LOCAL request.jwt.claims='{"sub":"51000000-0000-0000-0000-000000000004","is_anonymous":true,"role":"authenticated"}';
SELECT pg_temp.denied(format($q$SELECT public.join_player_link(%L,'53000000-0000-0000-0000-000000000001')$q$,(SELECT v FROM t WHERE k='token')),'23505');
SELECT pg_temp.assert(public.my_sync_status()->'memberships'->0->>'role'='player','approved player unchanged');

-- 6. Revoking the links removes link guests at once and leaves their scores and the approved player.
SET LOCAL request.jwt.claims='{"sub":"51000000-0000-0000-0000-000000000001","is_anonymous":false,"role":"authenticated"}';
SELECT pg_temp.assert(public.revoke_player_links('52000000-0000-0000-0000-000000000001')->>'members'='2','two link guests removed');
SELECT pg_temp.assert(public.fetch_snapshot('52000000-0000-0000-0000-000000000001')->'rounds'->0->'players'->0->'cells'->0->>'strokes'='4','scores stay after revoke');
SET LOCAL request.jwt.claims='{"sub":"51000000-0000-0000-0000-000000000002","is_anonymous":true,"role":"authenticated"}';
SELECT pg_temp.denied($q$SELECT public.fetch_snapshot('52000000-0000-0000-0000-000000000001')$q$,'42501');
SELECT pg_temp.denied($q$SELECT public.write_score('52000000-0000-0000-0000-000000000001','55000000-0000-0000-0000-000000000001','53000000-0000-0000-0000-000000000001',1,'set',9,1,'61000000-0000-0000-0000-000000000007','g')$q$,'42501');
SELECT pg_temp.denied(format($q$SELECT public.player_link_roster(%L)$q$,(SELECT v FROM t WHERE k='token')),'22023');
SELECT pg_temp.denied(format($q$SELECT public.join_player_link(%L,'53000000-0000-0000-0000-000000000001')$q$,(SELECT v FROM t WHERE k='token')),'22023');
SET LOCAL request.jwt.claims='{"sub":"51000000-0000-0000-0000-000000000004","is_anonymous":true,"role":"authenticated"}';
SELECT pg_temp.assert(public.fetch_snapshot('52000000-0000-0000-0000-000000000001')->>'name'='Saturday foursome','approved player still in after link revoke');

-- 7. A new link works, but a guest the host removed does not come back through it.
SET LOCAL request.jwt.claims='{"sub":"51000000-0000-0000-0000-000000000001","is_anonymous":false,"role":"authenticated"}';
INSERT INTO t SELECT 'token2', public.create_player_link('52000000-0000-0000-0000-000000000001');
SET LOCAL request.jwt.claims='{"sub":"51000000-0000-0000-0000-000000000002","is_anonymous":true,"role":"authenticated"}';
SELECT pg_temp.denied(format($q$SELECT public.join_player_link(%L,'53000000-0000-0000-0000-000000000001')$q$,(SELECT v FROM t WHERE k='token2')),'42501');
SET LOCAL request.jwt.claims='{"sub":"51000000-0000-0000-0000-000000000005","is_anonymous":true,"role":"authenticated"}';
SELECT pg_temp.assert((SELECT public.join_player_link(v,'53000000-0000-0000-0000-000000000002')->>'status' FROM t WHERE k='token2')='joined','a new guest joins by the new link');

-- 8. No sign-in at all: nothing is reachable. Tables are closed to clients.
RESET ROLE;
SELECT pg_temp.assert(NOT has_function_privilege('anon','public.player_link_roster(text)','execute') AND NOT has_function_privilege('anon','public.join_player_link(text,uuid)','execute')
 AND NOT has_function_privilege('authenticated','public.player_link_contest(text)','execute'),'anon cannot call; helper is internal');
SELECT pg_temp.assert(NOT has_table_privilege('authenticated','public.player_links','select') AND NOT has_table_privilege('anon','public.player_link_members','select'),'tables closed to clients');

-- 9. A finished round takes no new guests.
UPDATE public.contests SET status='completed' WHERE id='52000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"51000000-0000-0000-0000-000000000003","is_anonymous":true,"role":"authenticated"}';
SELECT pg_temp.denied(format($q$SELECT public.join_player_link(%L,'53000000-0000-0000-0000-000000000001')$q$,(SELECT v FROM t WHERE k='token2')),'55000');
RESET ROLE;
SELECT 'PASS: web player links' AS result;
ROLLBACK;
