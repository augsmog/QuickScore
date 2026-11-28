-- Disposable database only. Runs inside one transaction and rolls back.
-- Needs both proposed web files. One section per finding of the 28 Nov review of 38a7edd
-- (AUG-1601, reply afaea2a2). Each assertion failed before its fix.
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'REVIEW_ASSERT: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.denied(sql text, state text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE sql; EXCEPTION WHEN OTHERS THEN
 IF SQLSTATE=state THEN RETURN; END IF; RAISE; END;
 RAISE EXCEPTION 'REVIEW_ASSERT: expected % for %',state,sql;
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

-- Setup: A hosts Group A and enters Matt 4; B joins the same card.
SET LOCAL request.jwt.claims='{"sub":"81000000-0000-0000-0000-000000000002","is_anonymous":true,"role":"authenticated"}';
SELECT public.join_player_link(v,'83000000-0000-0000-0000-000000000001') FROM t WHERE k='token';
SELECT pg_temp.assert(pg_temp.w('1',1,4)->>'status'='accepted','A enters Matt 4');
SET LOCAL request.jwt.claims='{"sub":"81000000-0000-0000-0000-000000000003","is_anonymous":true,"role":"authenticated"}';
SELECT public.join_player_link(v,'83000000-0000-0000-0000-000000000002') FROM t WHERE k='token';

-- Finding 4. Re-entering the number already there must not make someone else's score "mine".
SELECT pg_temp.assert(pg_temp.w('1',1,4)->>'status'='accepted','B re-enters the same 4: nothing to hold');
SELECT pg_temp.assert(pg_temp.w('1',1,6)->>'flagged'='true' AND pg_temp.cell('1',1)=4,'B then changes it: still held for the group host, score unchanged');
INSERT INTO t SELECT 'flag', pg_temp.flags()->0->>'id';

-- Package review, B (stale flag). The organizer moves the PLAYER to another group while the old
-- group keeps its host. The old group's host must not decide a score that is no longer theirs.
RESET ROLE;
UPDATE public.round_player_assignments SET group_id='86000000-0000-0000-0000-000000000002' WHERE contest_id='82000000-0000-0000-0000-000000000001' AND player_id='83000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"81000000-0000-0000-0000-000000000002","is_anonymous":true,"role":"authenticated"}';
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(pg_temp.flags()) f WHERE f->>'can_resolve'='true'),'old group''s host is not offered a decision on a player who left the group');
SELECT pg_temp.denied(format($q$SELECT public.resolve_score_flag(%L,true)$q$,(SELECT v FROM t WHERE k='flag')),'42501');
SELECT pg_temp.denied(format($q$SELECT public.resolve_score_flag(%L,false)$q$,(SELECT v FROM t WHERE k='flag')),'42501');
SELECT pg_temp.assert(pg_temp.cell('1',1)=4,'score not changed by the old group''s host');
-- A player taken out of every group: only the organizer may decide.
RESET ROLE;
DELETE FROM public.round_player_assignments WHERE contest_id='82000000-0000-0000-0000-000000000001' AND player_id='83000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT pg_temp.denied(format($q$SELECT public.resolve_score_flag(%L,true)$q$,(SELECT v FROM t WHERE k='flag')),'42501');
RESET ROLE;
INSERT INTO public.round_player_assignments(contest_id,round_id,player_id,group_id) VALUES('82000000-0000-0000-0000-000000000001','85000000-0000-0000-0000-000000000001','83000000-0000-0000-0000-000000000001','86000000-0000-0000-0000-000000000001');
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert(EXISTS(SELECT 1 FROM jsonb_array_elements(pg_temp.flags()) f WHERE f->>'can_resolve'='true'),'back in the group: its host may decide again');

-- Finding 2. A host moved to another card loses authority over the old group.
SET LOCAL request.jwt.claims='{"sub":"81000000-0000-0000-0000-000000000001","is_anonymous":false,"role":"authenticated"}';
SELECT public.assign_player_link_member('82000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000002','83000000-0000-0000-0000-000000000003');
SET LOCAL request.jwt.claims='{"sub":"81000000-0000-0000-0000-000000000002","is_anonymous":true,"role":"authenticated"}';
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(pg_temp.flags()) f WHERE f->>'can_resolve'='true'),'moved host no longer sees the old group''s flag as theirs to decide');
SELECT pg_temp.denied(format($q$SELECT public.resolve_score_flag(%L,true)$q$,(SELECT v FROM t WHERE k='flag')),'42501');
SELECT pg_temp.assert(pg_temp.cell('1',1)=4,'score not changed by the moved host');

-- Finding 1. With no valid host for the group, a decision fails closed for everyone but the organizer.
SET LOCAL request.jwt.claims='{"sub":"81000000-0000-0000-0000-000000000006","is_anonymous":true,"role":"authenticated"}';
SELECT pg_temp.denied(format($q$SELECT public.resolve_score_flag(%L,true)$q$,(SELECT v FROM t WHERE k='flag')),'42501');
SELECT pg_temp.denied(format($q$SELECT public.resolve_score_flag(%L,false)$q$,(SELECT v FROM t WHERE k='flag')),'42501');
SET LOCAL request.jwt.claims='{"sub":"81000000-0000-0000-0000-000000000003","is_anonymous":true,"role":"authenticated"}';
SELECT pg_temp.denied(format($q$SELECT public.resolve_score_flag(%L,true)$q$,(SELECT v FROM t WHERE k='flag')),'42501');
SELECT pg_temp.assert(pg_temp.flags()->0->>'can_resolve'='false' AND pg_temp.cell('1',1)=4,'the proposer cannot decide their own change; score unchanged');
-- A removed proposer cannot decide either.
SET LOCAL request.jwt.claims='{"sub":"81000000-0000-0000-0000-000000000001","is_anonymous":false,"role":"authenticated"}';
SELECT public.revoke_membership('82000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000003');
SET LOCAL request.jwt.claims='{"sub":"81000000-0000-0000-0000-000000000003","is_anonymous":true,"role":"authenticated"}';
SELECT pg_temp.denied(format($q$SELECT public.resolve_score_flag(%L,true)$q$,(SELECT v FROM t WHERE k='flag')),'42501');
SET LOCAL request.jwt.claims='{"sub":"81000000-0000-0000-0000-000000000001","is_anonymous":false,"role":"authenticated"}';
SELECT pg_temp.assert(public.resolve_score_flag((SELECT v FROM t WHERE k='flag')::uuid,false)->>'status'='denied','the organizer can still settle it');
RESET ROLE;

SELECT pg_temp.assert(NOT has_function_privilege('authenticated','public.flag_host(uuid,uuid,uuid)','execute') AND NOT has_function_privilege('anon','public.flag_host(uuid,uuid,uuid)','execute'),'the host lookup is internal: no client can call it');

-- Finding 5. Deleting an account must not be blocked by the new tables.
SELECT pg_temp.assert((SELECT count(*) FROM pg_constraint k WHERE k.contype='f' AND k.confrelid='auth.users'::regclass
 AND k.conrelid IN ('public.player_links'::regclass,'public.player_link_members'::regclass,'public.group_card_hosts'::regclass,'public.score_flags'::regclass,'public.card_reopens'::regclass,'public.watch_code_members'::regclass)
 AND k.confdeltype NOT IN ('c','n'))=0,'every new reference to an account goes away with the account');
SELECT pg_temp.assert((SELECT count(*) FROM pg_constraint k WHERE k.contype='f' AND k.confrelid='auth.users'::regclass
 AND k.conrelid IN ('public.player_links'::regclass,'public.player_link_members'::regclass,'public.group_card_hosts'::regclass,'public.score_flags'::regclass,'public.card_reopens'::regclass,'public.watch_code_members'::regclass))>=6,'the references are there to check');

-- Finding 7. Watching by code has its own budget and never touches the app's join budget;
-- a join request someone already made is not turned into a watcher.
DELETE FROM public.sync_join_budgets;
INSERT INTO public.contest_memberships(contest_id,user_id,role,player_id,status) VALUES('82000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000006','player','83000000-0000-0000-0000-000000000003','pending');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"81000000-0000-0000-0000-000000000005","is_anonymous":true,"role":"authenticated"}';
SELECT pg_temp.assert(public.watch_code('RULES1')->>'status'='watching','a visitor watches by code');
SET LOCAL request.jwt.claims='{"sub":"81000000-0000-0000-0000-000000000006","is_anonymous":true,"role":"authenticated"}';
SELECT pg_temp.assert(public.watch_code('RULES1')->>'status'='unknown','someone with a join request waiting is not made a watcher');
SELECT pg_temp.denied((SELECT format($q$SELECT public.join_player_link(%L,'83000000-0000-0000-0000-000000000001')$q$,v) FROM t WHERE k='token'),'23505');
RESET ROLE;
SELECT pg_temp.assert((SELECT status FROM public.contest_memberships WHERE contest_id='82000000-0000-0000-0000-000000000001' AND user_id='81000000-0000-0000-0000-000000000006')='pending','the join request is untouched');
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM public.sync_join_budgets WHERE scope='global' OR scope LIKE 'actor:%'),'the app''s join budget is not spent by watching');
SELECT pg_temp.assert(EXISTS(SELECT 1 FROM public.sync_join_budgets WHERE scope='watch:global') AND EXISTS(SELECT 1 FROM public.sync_join_budgets WHERE scope='watch:contest:82000000-0000-0000-0000-000000000001'),'watching has its own budget, overall and per round');
-- Finding 6 (first half). Only memberships a code or a link created are recorded as such.
SELECT pg_temp.assert((SELECT count(*) FROM public.watch_code_members WHERE contest_id='82000000-0000-0000-0000-000000000001')=1,'the watcher the code created is recorded; nobody else');
-- Per-round cap: the 61st new watcher in a minute gets the same answer as a wrong code.
UPDATE public.sync_join_budgets SET attempts=60 WHERE scope='watch:contest:82000000-0000-0000-0000-000000000001';
INSERT INTO auth.users(id) VALUES('81000000-0000-0000-0000-000000000007');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"81000000-0000-0000-0000-000000000007","is_anonymous":true,"role":"authenticated"}';
SELECT pg_temp.assert(public.watch_code('RULES1')->>'status'='unknown','over the per-round limit: same answer as a wrong code');
RESET ROLE;

-- Package review, B (ownership). When the organizer deletes their account, the round must not
-- pass to a watcher, a web guest, a removed member or someone whose request is still waiting.
-- Here: users 2 and 3 are web guests (3 was removed), 5 is a watcher, 6 has a request waiting;
-- user 4 (Dave) is the one approved player with the app.
SELECT public.purge_account('81000000-0000-0000-0000-000000000001');
SELECT pg_temp.assert((SELECT owner_id FROM public.contests WHERE id='82000000-0000-0000-0000-000000000001')='81000000-0000-0000-0000-000000000004','the round passes to the approved player, not to a watcher or web guest');
-- With nobody eligible left, the round is removed with its organizer, as it already is today when nobody else is in it.
INSERT INTO public.contests(id,owner_id,name,course,protocol,sync_enabled,invite_code,bet_unit)
VALUES('82000000-0000-0000-0000-000000000002','81000000-0000-0000-0000-000000000004','Watchers only','{"name":"Course","holes":[{"num":1,"par":4,"hcp":1,"yards":400}]}',1,true,'RULES2',5);
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"81000000-0000-0000-0000-000000000005","is_anonymous":true,"role":"authenticated"}';
SELECT pg_temp.assert(public.watch_code('RULES2')->>'status'='watching','a watcher joins the second round');
RESET ROLE;
SELECT public.purge_account('81000000-0000-0000-0000-000000000004');
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM public.contests WHERE id='82000000-0000-0000-0000-000000000002'),'a round with only a watcher left does not pass to the watcher');
SELECT 'PASS: web review findings' AS result;
ROLLBACK;
