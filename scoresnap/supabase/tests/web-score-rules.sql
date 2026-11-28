-- Disposable database only. Runs inside one transaction and rolls back.
-- Needs proposed/20261128000000_web_player_links.sql and proposed/20261128010000_web_score_rules.sql.
-- Tests the rules Augie decided on 2026-11-28 (AUG-1601): group host, flagged changes that
-- the group host or organizer accepts or denies, reconcile, one-hour reopen, code = watch only.
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'WEBRULES_ASSERT: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.denied(sql text, state text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE sql; EXCEPTION WHEN OTHERS THEN
 IF SQLSTATE=state THEN RETURN; END IF; RAISE; END;
 RAISE EXCEPTION 'WEBRULES_ASSERT: expected % for %',state,sql;
END $$;
-- The score a cell holds now, read past row security (what the board and the money use).
CREATE FUNCTION pg_temp.cell(p text, h integer) RETURNS integer LANGUAGE sql SECURITY DEFINER AS $$
 SELECT e.strokes FROM public.score_events e WHERE e.contest_id='82000000-0000-0000-0000-000000000001' AND e.player_id=('83000000-0000-0000-0000-00000000000'||p)::uuid AND e.hole=h AND e.cell_version IS NOT NULL ORDER BY e.cell_version DESC LIMIT 1 $$;
CREATE FUNCTION pg_temp.ver(p text, h integer) RETURNS bigint LANGUAGE sql SECURITY DEFINER AS $$
 SELECT coalesce(max(e.cell_version),0) FROM public.score_events e WHERE e.contest_id='82000000-0000-0000-0000-000000000001' AND e.player_id=('83000000-0000-0000-0000-00000000000'||p)::uuid AND e.hole=h AND e.cell_version IS NOT NULL $$;
-- Write as the current caller, against the cell's current version (so never a stale write).
CREATE FUNCTION pg_temp.w(p text, h integer, s integer) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.write_score('82000000-0000-0000-0000-000000000001','85000000-0000-0000-0000-000000000001',('83000000-0000-0000-0000-00000000000'||p)::uuid,h,'set',s,pg_temp.ver(p,h),gen_random_uuid(),'t') $$;
CREATE FUNCTION pg_temp.flags() RETURNS jsonb LANGUAGE sql AS $$ SELECT public.list_score_flags('82000000-0000-0000-0000-000000000001') $$;
CREATE TEMP TABLE t(k text PRIMARY KEY, v text);
GRANT ALL ON t TO authenticated, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated,anon;

-- organizer=1, web guest A=2, web guest B=3, app player (Dave)=4, code spectator=5, stranger=6
INSERT INTO auth.users(id) SELECT ('81000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid FROM generate_series(1,6)i;
INSERT INTO public.contests(id,owner_id,name,course,protocol,sync_enabled,invite_code,bet_unit)
VALUES('82000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000001','Rules round','{"name":"Course","holes":[{"num":1,"par":4,"hcp":1,"yards":400}]}',1,true,'RULES1',5);
UPDATE public.contest_rounds SET id='85000000-0000-0000-0000-000000000001' WHERE contest_id='82000000-0000-0000-0000-000000000001' AND round_number=1;
INSERT INTO public.contest_groups(id,contest_id,round_id,name,sort_order) VALUES
 ('86000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000001','85000000-0000-0000-0000-000000000001','Group A',1),
 ('86000000-0000-0000-0000-000000000002','82000000-0000-0000-0000-000000000001','85000000-0000-0000-0000-000000000001','Group B',2);
-- players 1 Matt, 2 Augie (Group A); 3 Chris, 4 Dave (Group B)
INSERT INTO public.contest_players(id,contest_id,name,sort_order) SELECT ('83000000-0000-0000-0000-00000000000'||i)::uuid,'82000000-0000-0000-0000-000000000001',(ARRAY['Matt','Augie','Chris','Dave'])[i],i FROM generate_series(1,4)i;
INSERT INTO public.round_player_assignments(contest_id,round_id,player_id,group_id)
 SELECT '82000000-0000-0000-0000-000000000001','85000000-0000-0000-0000-000000000001',('83000000-0000-0000-0000-00000000000'||i)::uuid,('86000000-0000-0000-0000-00000000000'||CASE WHEN i<=2 THEN 1 ELSE 2 END)::uuid FROM generate_series(1,4)i;
INSERT INTO public.contest_memberships(contest_id,user_id,role,player_id,status) VALUES('82000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000004','player','83000000-0000-0000-0000-000000000004','approved');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"81000000-0000-0000-0000-000000000001","is_anonymous":false,"role":"authenticated"}';
INSERT INTO t SELECT 'token', public.create_player_link('82000000-0000-0000-0000-000000000001');

-- 1. Group host = whoever took the group's card first. A takes Group A; B joins it later.
SET LOCAL request.jwt.claims='{"sub":"81000000-0000-0000-0000-000000000002","is_anonymous":true,"role":"authenticated"}';
SELECT public.join_player_link(v,'83000000-0000-0000-0000-000000000001') FROM t WHERE k='token';
SELECT pg_temp.assert(pg_temp.w('1',1,4)->>'status'='accepted','A (group host) enters Matt 4');
SET LOCAL request.jwt.claims='{"sub":"81000000-0000-0000-0000-000000000003","is_anonymous":true,"role":"authenticated"}';
SELECT public.join_player_link(v,'83000000-0000-0000-0000-000000000002') FROM t WHERE k='token';
SELECT pg_temp.assert(pg_temp.w('2',1,5)->>'status'='accepted','B, a later scorer, may fill an empty cell');
SELECT pg_temp.assert(pg_temp.w('2',1,4)->>'status'='accepted','B may correct a score B entered');

-- 2. B changes a score A entered: flagged, not applied. The entered score keeps counting.
INSERT INTO t SELECT 'flagged', pg_temp.w('1',1,6)::text;
SELECT pg_temp.assert((SELECT v::jsonb->>'status'='conflict' AND v::jsonb->>'flagged'='true' AND v::jsonb->>'strokes'='4' FROM t WHERE k='flagged'),'later scorer''s change is flagged and answered with the entered score');
SELECT pg_temp.assert(pg_temp.cell('1',1)=4,'entered score still counts while flagged');
SELECT pg_temp.assert(jsonb_array_length(pg_temp.flags())=1 AND pg_temp.flags()->0->>'mine'='true' AND pg_temp.flags()->0->>'can_resolve'='false'
 AND pg_temp.flags()->0->>'proposed_strokes'='6' AND pg_temp.flags()->0->>'current_strokes'='4' AND pg_temp.flags()->0->>'player_name'='Matt','proposer sees their pending change and cannot resolve it');
SELECT pg_temp.denied(format($q$SELECT public.resolve_score_flag(%L,true)$q$,pg_temp.flags()->0->>'id'),'42501');
SELECT pg_temp.assert(pg_temp.w('1',1,7)->>'flagged'='true' AND jsonb_array_length(pg_temp.flags())=1 AND pg_temp.flags()->0->>'proposed_strokes'='7','asking again replaces the earlier ask, one pending flag per person per hole');
INSERT INTO t SELECT 'flag1', pg_temp.flags()->0->>'id';

-- 3. Who sees the flag: the group host and the organizer; not someone from another group.
SET LOCAL request.jwt.claims='{"sub":"81000000-0000-0000-0000-000000000004","is_anonymous":true,"role":"authenticated"}';
SELECT pg_temp.assert(jsonb_array_length(pg_temp.flags())=0,'a player in another group does not see it');
SELECT pg_temp.denied(format($q$SELECT public.resolve_score_flag(%L,true)$q$,(SELECT v FROM t WHERE k='flag1')),'42501');
SET LOCAL request.jwt.claims='{"sub":"81000000-0000-0000-0000-000000000006","is_anonymous":true,"role":"authenticated"}';
SELECT pg_temp.denied($q$SELECT pg_temp.flags()$q$,'42501');
SET LOCAL request.jwt.claims='{"sub":"81000000-0000-0000-0000-000000000001","is_anonymous":false,"role":"authenticated"}';
SELECT pg_temp.assert(jsonb_array_length(pg_temp.flags())=1 AND pg_temp.flags()->0->>'can_resolve'='true','organizer sees it and can resolve');
SET LOCAL request.jwt.claims='{"sub":"81000000-0000-0000-0000-000000000002","is_anonymous":true,"role":"authenticated"}';
SELECT pg_temp.assert(jsonb_array_length(pg_temp.flags())=1 AND pg_temp.flags()->0->>'can_resolve'='true' AND pg_temp.flags()->0->>'mine'='false','group host sees it and can resolve');

-- 4. Deny: the entered score stands. Accept: the proposed score replaces it.
SELECT pg_temp.assert((SELECT public.resolve_score_flag(v::uuid,false)->>'status' FROM t WHERE k='flag1')='denied','group host denies');
SELECT pg_temp.assert(pg_temp.cell('1',1)=4 AND jsonb_array_length(pg_temp.flags())=0,'denied: score unchanged, flag closed');
SELECT pg_temp.denied(format($q$SELECT public.resolve_score_flag(%L,true)$q$,(SELECT v FROM t WHERE k='flag1')),'22023');
SET LOCAL request.jwt.claims='{"sub":"81000000-0000-0000-0000-000000000003","is_anonymous":true,"role":"authenticated"}';
SELECT pg_temp.assert(pg_temp.w('1',1,6)->>'flagged'='true','B asks again');
SET LOCAL request.jwt.claims='{"sub":"81000000-0000-0000-0000-000000000002","is_anonymous":true,"role":"authenticated"}';
SELECT pg_temp.assert(public.resolve_score_flag((pg_temp.flags()->0->>'id')::uuid,true)->>'status'='accepted','group host accepts');
SELECT pg_temp.assert(pg_temp.cell('1',1)=6 AND pg_temp.ver('1',1)=2 AND jsonb_array_length(pg_temp.flags())=0,'accepted: proposed score now counts, flag closed');

-- 5. Reconcile: the group host edits the score to match, and the flag drops by itself.
SELECT pg_temp.assert(pg_temp.w('1',2,4)->>'status'='accepted','A enters Matt hole 2');
SET LOCAL request.jwt.claims='{"sub":"81000000-0000-0000-0000-000000000003","is_anonymous":true,"role":"authenticated"}';
SELECT pg_temp.assert(pg_temp.w('1',2,5)->>'flagged'='true','B flags hole 2');
SET LOCAL request.jwt.claims='{"sub":"81000000-0000-0000-0000-000000000002","is_anonymous":true,"role":"authenticated"}';
SELECT pg_temp.assert(pg_temp.w('1',2,3)->>'status'='accepted' AND jsonb_array_length(pg_temp.flags())=1,'host edits to a different value: flag stays');
SELECT pg_temp.assert(pg_temp.w('1',2,5)->>'status'='accepted' AND jsonb_array_length(pg_temp.flags())=0 AND pg_temp.cell('1',2)=5,'host edits to match: flag reconciled');
-- The group host overwrites a score B entered without a flag.
SELECT pg_temp.assert(pg_temp.w('2',1,6)->>'status'='accepted' AND NOT (pg_temp.w('2',1,5) ? 'flagged'),'group host changes any score in the group directly');

-- 6. The organizer is never flagged and can settle any flag.
SET LOCAL request.jwt.claims='{"sub":"81000000-0000-0000-0000-000000000003","is_anonymous":true,"role":"authenticated"}';
SELECT pg_temp.assert(pg_temp.w('2',1,4)->>'flagged'='true','B changing a score the host re-entered is flagged');
SET LOCAL request.jwt.claims='{"sub":"81000000-0000-0000-0000-000000000001","is_anonymous":false,"role":"authenticated"}';
SELECT pg_temp.assert(public.resolve_score_flag((pg_temp.flags()->0->>'id')::uuid,true)->>'status'='accepted' AND pg_temp.cell('2',1)=4,'organizer accepts');
SELECT pg_temp.assert(pg_temp.w('1',1,5)->>'status'='accepted' AND pg_temp.cell('1',1)=5,'organizer changes a score directly');

-- 7. The app counts too: the organizer scores Group B first and is its host; the app player's
--    change to a score the organizer entered is flagged, their own entry is not.
SELECT pg_temp.assert(pg_temp.w('4',1,5)->>'status'='accepted','organizer enters Dave hole 1 and takes Group B');
SET LOCAL request.jwt.claims='{"sub":"81000000-0000-0000-0000-000000000004","is_anonymous":true,"role":"authenticated"}';
SELECT pg_temp.assert(pg_temp.w('4',2,4)->>'status'='accepted' AND pg_temp.w('4',2,5)->>'status'='accepted','app player enters and corrects their own hole');
SELECT pg_temp.assert(pg_temp.w('4',1,4)->>'flagged'='true' AND pg_temp.cell('4',1)=5,'app player changing the organizer''s entry is flagged');

-- 8. If the group host is removed, the next scorer takes the card.
SET LOCAL request.jwt.claims='{"sub":"81000000-0000-0000-0000-000000000001","is_anonymous":false,"role":"authenticated"}';
SELECT public.revoke_membership('82000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000002');
SET LOCAL request.jwt.claims='{"sub":"81000000-0000-0000-0000-000000000003","is_anonymous":true,"role":"authenticated"}';
SELECT pg_temp.assert(pg_temp.w('1',3,4)->>'status'='accepted' AND pg_temp.w('1',2,4)->>'status'='accepted' AND pg_temp.cell('1',2)=4,'B takes over Group A and edits freely');

-- 9. The code on the website: watch only.
SET LOCAL request.jwt.claims='{"sub":"81000000-0000-0000-0000-000000000005","is_anonymous":true,"role":"authenticated"}';
SELECT pg_temp.assert(public.watch_code('nosuch')->>'status'='unknown','wrong code: generic answer');
SELECT pg_temp.denied($q$SELECT public.fetch_snapshot('82000000-0000-0000-0000-000000000001')$q$,'42501');
SELECT pg_temp.assert(public.watch_code(' rules1 ')->>'contest_id'='82000000-0000-0000-0000-000000000001','code lets a guest watch');
SELECT pg_temp.assert(public.my_sync_status()->'memberships'->0->>'role'='viewer' AND public.fetch_snapshot('82000000-0000-0000-0000-000000000001')->>'name'='Rules round','watcher reads the round');
SELECT pg_temp.denied($q$SELECT pg_temp.w('1',4,4)$q$,'42501');
SELECT pg_temp.denied($q$SELECT public.reopen_card('82000000-0000-0000-0000-000000000001')$q$,'42501');
SELECT pg_temp.assert(NOT (public.fetch_snapshot('82000000-0000-0000-0000-000000000001') ? 'invite_code'),'watcher never receives the code back');
SET LOCAL request.jwt.claims='{"sub":"81000000-0000-0000-0000-000000000001","is_anonymous":false,"role":"authenticated"}';
SELECT public.revoke_membership('82000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000005');
SET LOCAL request.jwt.claims='{"sub":"81000000-0000-0000-0000-000000000005","is_anonymous":true,"role":"authenticated"}';
SELECT pg_temp.assert(public.watch_code('RULES1')->>'status'='unknown','a watcher the organizer removed does not come back by the code');
RESET ROLE;
SELECT pg_temp.assert(NOT has_function_privilege('anon','public.watch_code(text)','execute') AND NOT has_function_privilege('anon','public.resolve_score_flag(uuid,boolean)','execute')
 AND NOT has_function_privilege('authenticated','public.group_card_host(uuid,uuid,uuid)','execute') AND NOT has_table_privilege('authenticated','public.score_flags','select'),'no session reaches none of it; internals are closed');

-- 10. Finalized looks final at once. For one hour, a scorer who reopens can fix a score.
UPDATE public.contests SET status='completed' WHERE id='82000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"81000000-0000-0000-0000-000000000003","is_anonymous":true,"role":"authenticated"}';
SELECT pg_temp.assert(public.fetch_snapshot('82000000-0000-0000-0000-000000000001')->>'completed'='true','round shows as finished');
SELECT pg_temp.denied($q$SELECT pg_temp.w('1',4,4)$q$,'55000');
SELECT pg_temp.assert(public.reopen_card('82000000-0000-0000-0000-000000000001')->>'status'='reopened','scorer reopens');
SELECT pg_temp.assert(pg_temp.w('1',4,4)->>'status'='accepted' AND pg_temp.cell('1',4)=4,'after reopening, the fix is accepted');
SELECT pg_temp.assert(public.fetch_snapshot('82000000-0000-0000-0000-000000000001')->>'completed'='true','the round still shows as finished');
SET LOCAL request.jwt.claims='{"sub":"81000000-0000-0000-0000-000000000004","is_anonymous":true,"role":"authenticated"}';
SELECT pg_temp.denied($q$SELECT pg_temp.w('4',3,4)$q$,'55000');
SET LOCAL request.jwt.claims='{"sub":"81000000-0000-0000-0000-000000000006","is_anonymous":true,"role":"authenticated"}';
SELECT pg_temp.denied($q$SELECT public.reopen_card('82000000-0000-0000-0000-000000000001')$q$,'42501');
-- A flag can still be settled inside the hour.
SET LOCAL request.jwt.claims='{"sub":"81000000-0000-0000-0000-000000000001","is_anonymous":false,"role":"authenticated"}';
SELECT pg_temp.assert(public.resolve_score_flag((pg_temp.flags()->0->>'id')::uuid,false)->>'status'='denied','organizer settles the app player''s flag inside the hour');
-- After the hour: locked for everyone, reopened or not.
RESET ROLE;
UPDATE public.contest_finalizations SET finalized_at=now()-interval '61 minutes' WHERE contest_id='82000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"81000000-0000-0000-0000-000000000003","is_anonymous":true,"role":"authenticated"}';
SELECT pg_temp.denied($q$SELECT pg_temp.w('1',5,4)$q$,'55000');
SELECT pg_temp.denied($q$SELECT public.reopen_card('82000000-0000-0000-0000-000000000001')$q$,'55000');
-- Finalizing again starts a fresh hour and needs a fresh reopen.
RESET ROLE;
UPDATE public.contests SET status='active' WHERE id='82000000-0000-0000-0000-000000000001';
UPDATE public.contests SET status='completed' WHERE id='82000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT pg_temp.denied($q$SELECT pg_temp.w('1',5,4)$q$,'55000');
SELECT pg_temp.assert(public.reopen_card('82000000-0000-0000-0000-000000000001')->>'status'='reopened' AND pg_temp.w('1',5,4)->>'status'='accepted','a new finalize needs a new reopen');
RESET ROLE;
SELECT 'PASS: web score rules' AS result;
ROLLBACK;
