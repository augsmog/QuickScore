-- M3 RLS/ACL, two-client sync, and offline replay. Rolls back all rows.
BEGIN;
CREATE TEMP SEQUENCE m3_assert_seq;
CREATE FUNCTION pg_temp.assert(ok boolean, label text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'M3_ASSERT %', label; END IF;
  PERFORM nextval('pg_temp.m3_assert_seq');
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.assert(boolean, text) TO anon, authenticated;
INSERT INTO auth.users(id) VALUES
 ('10000000-0000-0000-0000-000000000011'),
 ('10000000-0000-0000-0000-000000000012'),
 ('10000000-0000-0000-0000-000000000013'),
 ('10000000-0000-0000-0000-000000000014');
INSERT INTO public.contests(id, owner_id, course, protocol, sync_enabled, invite_code) VALUES
 ('21000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000011', '{}', 0, false, 'M3PROT'),
 ('21000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000011', '{}', 1, true, 'M3SYNC');
INSERT INTO public.contest_players(id, contest_id, user_id, name) VALUES
 ('31000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000012', 'Guest'),
 ('31000000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000001', NULL, 'Other');

-- Protocol 0 direct inserts. Single-user Postgres does not enforce RLS row checks.
DO $$ BEGIN
  IF coalesce(current_setting('m2.single_user', true), 'off') = 'on' THEN
    RAISE NOTICE 'SKIP raw RLS row checks';
    RETURN;
  END IF;
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000012","role":"authenticated","is_anonymous":false}', true);
  INSERT INTO public.score_events(contest_id, player_id, hole, strokes, entered_by)
  VALUES ('21000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', 1, 4, '10000000-0000-0000-0000-000000000012');
  BEGIN
    INSERT INTO public.score_events(contest_id, player_id, hole, strokes, entered_by)
    VALUES ('21000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000002', 1, 5, '10000000-0000-0000-0000-000000000012');
    RAISE EXCEPTION 'M3_UNGUARDED: cross player score';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN raise_exception THEN
      IF SQLERRM LIKE 'M3_UNGUARDED:%' THEN RAISE; END IF;
      RAISE;
  END;
  EXECUTE 'RESET ROLE';
END $$;
SELECT pg_temp.assert(
  coalesce(current_setting('m2.single_user', true), 'off') = 'on'
  OR NOT EXISTS (SELECT 1 FROM public.score_events WHERE player_id = '31000000-0000-0000-0000-000000000002'),
  'guest direct score stays off the other player');

RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000011","role":"authenticated","is_anonymous":false}';
SELECT set_config('m3.bundle', public.sync_round_bundle('21000000-0000-0000-0000-000000000002', jsonb_build_object(
  'local_id', 'round-local', 'number', 1, 'name', 'Round 1',
  'groups', jsonb_build_array(jsonb_build_object(
    'local_id', 'group-local', 'name', 'Group 1', 'sort_order', 0,
    'players', jsonb_build_array(
      jsonb_build_object('local_id', 'ada', 'server_id', '31000000-0000-0000-0000-000000000011', 'name', 'Ada', 'handicap', 5, 'sort_order', 0, 'status', 'active'),
      jsonb_build_object('local_id', 'bea', 'server_id', '31000000-0000-0000-0000-000000000012', 'name', 'Bea', 'handicap', 8, 'sort_order', 1, 'status', 'active')
    )
  ))
))::text, true);
SELECT pg_temp.assert((current_setting('m3.bundle')::jsonb->>'round_id') IS NOT NULL, 'bundle returns round');
SELECT public.set_tournament_meta('21000000-0000-0000-0000-000000000002', true, 1);
RESET ROLE;
SELECT pg_temp.assert((SELECT count(*) FROM public.contest_players WHERE contest_id = '21000000-0000-0000-0000-000000000002') = 2, 'two players');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000011","role":"authenticated","is_anonymous":false}';
SELECT public.sync_round_bundle('21000000-0000-0000-0000-000000000002', jsonb_build_object(
  'local_id', 'round-local', 'number', 1, 'name', 'Round 1',
  'groups', jsonb_build_array(jsonb_build_object(
    'local_id', 'group-local', 'name', 'Group 1',
    'players', jsonb_build_array(jsonb_build_object('local_id', 'ada', 'name', 'Ada', 'handicap', 5, 'sort_order', 0))
  ))
));
RESET ROLE;
SELECT pg_temp.assert(EXISTS (SELECT 1 FROM public.contest_players WHERE id = '31000000-0000-0000-0000-000000000012'), 'dropping a foursome keeps the player');
SELECT pg_temp.assert(NOT EXISTS (SELECT 1 FROM public.round_player_assignments WHERE player_id = '31000000-0000-0000-0000-000000000012'), 'dropped foursome loses the assignment');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000011","role":"authenticated","is_anonymous":false}';
SELECT public.sync_round_bundle('21000000-0000-0000-0000-000000000002', jsonb_build_object(
  'local_id', 'round-local', 'number', 1, 'name', 'Round 1',
  'groups', jsonb_build_array(jsonb_build_object(
    'local_id', 'group-local', 'name', 'Group 1',
    'players', jsonb_build_array(
      jsonb_build_object('local_id', 'ada', 'name', 'Ada', 'handicap', 5, 'sort_order', 0),
      jsonb_build_object('local_id', 'bea', 'name', 'Bea', 'handicap', 8, 'sort_order', 1)
    )
  ))
));
RESET ROLE;
SELECT pg_temp.assert((SELECT count(*) FROM public.round_player_assignments WHERE contest_id = '21000000-0000-0000-0000-000000000002') = 2, 'both players assigned again');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000012","role":"authenticated","is_anonymous":true}';
DO $$ BEGIN
  BEGIN
    PERFORM public.sync_round_bundle('21000000-0000-0000-0000-000000000002', '{"number":1,"name":"Round 1","groups":[]}'::jsonb);
    RAISE EXCEPTION 'anonymous host synced';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
SELECT pg_temp.assert(public.request_join('M3SYNC', 'Ada') = '{"status":"pending"}'::jsonb, 'claim stays pending');
SELECT pg_temp.assert(public.my_membership('21000000-0000-0000-0000-000000000002') IS NULL, 'pending claim has no membership');
RESET ROLE;
SELECT set_config('m3.request', (SELECT id::text FROM public.contest_join_requests WHERE requester = '10000000-0000-0000-0000-000000000012' AND status = 'pending'), true);
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000012","role":"authenticated","is_anonymous":true}';
DO $$ BEGIN
  BEGIN
    PERFORM public.decide_join_request(current_setting('m3.request')::uuid, true, '31000000-0000-0000-0000-000000000011');
    RAISE EXCEPTION 'M3_UNGUARDED: non-host approve';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN raise_exception THEN
      IF SQLERRM LIKE 'M3_UNGUARDED:%' THEN RAISE; END IF;
      RAISE;
  END;
END $$;
SET LOCAL request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000013","role":"authenticated","is_anonymous":false}';
DO $$ BEGIN
  BEGIN
    PERFORM public.decide_join_request(current_setting('m3.request')::uuid, true, '31000000-0000-0000-0000-000000000011');
    RAISE EXCEPTION 'M3_UNGUARDED: non-host approve';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN raise_exception THEN
      IF SQLERRM LIKE 'M3_UNGUARDED:%' THEN RAISE; END IF;
      RAISE;
  END;
END $$;
RESET ROLE;
SELECT pg_temp.assert(
  (SELECT status FROM public.contest_join_requests WHERE requester = '10000000-0000-0000-0000-000000000012') = 'pending',
  'non-host approve did not decide the claim');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000011","role":"authenticated","is_anonymous":false}';
SELECT public.decide_join_request(current_setting('m3.request')::uuid, true, '31000000-0000-0000-0000-000000000011');
SET LOCAL request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000012","role":"authenticated","is_anonymous":true}';
SELECT pg_temp.assert(public.my_membership('21000000-0000-0000-0000-000000000002')->>'status' = 'approved', 'host approved the claim');
RESET ROLE;
SELECT set_config('m3.round', (SELECT id::text FROM public.contest_rounds WHERE contest_id = '21000000-0000-0000-0000-000000000002' AND round_number = 1), true);
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000012","role":"authenticated","is_anonymous":true}';
SELECT pg_temp.assert(public.write_score('21000000-0000-0000-0000-000000000002', current_setting('m3.round')::uuid,
  '31000000-0000-0000-0000-000000000011', 1, 'set', 4, 0, '40000000-0000-0000-0000-0000000000a1', 'ada-h1')->>'status' = 'accepted', 'client A score');
DO $$ BEGIN
  BEGIN
    PERFORM public.write_score('21000000-0000-0000-0000-000000000002', NULL, '31000000-0000-0000-0000-000000000012', 1, 'set', 9, 0, '40000000-0000-0000-0000-0000000000a2', 'ada-foreign');
    RAISE EXCEPTION 'guest wrote another player';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.write_score('21000000-0000-0000-0000-000000000002', 'ffffffff-ffff-ffff-ffff-ffffffffffff', '31000000-0000-0000-0000-000000000011', 1, 'set', 4, 0, '40000000-0000-0000-0000-0000000000a3', 'bad-round');
    RAISE EXCEPTION 'foreign round accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END $$;
SELECT pg_temp.assert(public.write_score('21000000-0000-0000-0000-000000000002', NULL, '31000000-0000-0000-0000-000000000011', 2, 'set', 3, 0, '40000000-0000-0000-0000-0000000000b1', 'q1')->>'version' = '1', 'queued hole 2');
SELECT pg_temp.assert(public.write_score('21000000-0000-0000-0000-000000000002', NULL, '31000000-0000-0000-0000-000000000011', 2, 'set', 3, 0, '40000000-0000-0000-0000-0000000000b1', 'q1')->>'version' = '1', 'replay hole 2');
SELECT pg_temp.assert(public.write_score('21000000-0000-0000-0000-000000000002', NULL, '31000000-0000-0000-0000-000000000011', 2, 'set', 4, 1, '40000000-0000-0000-0000-0000000000b2', 'q2')->>'version' = '2', 'queued successor');
SELECT pg_temp.assert(public.write_score('21000000-0000-0000-0000-000000000002', NULL, '31000000-0000-0000-0000-000000000011', 2, 'set', 4, 1, '40000000-0000-0000-0000-0000000000b2', 'q2')->>'version' = '2', 'replay successor');

SET LOCAL request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000011","role":"authenticated","is_anonymous":false}';
SELECT pg_temp.assert(public.write_score('21000000-0000-0000-0000-000000000002', NULL, '31000000-0000-0000-0000-000000000012', 1, 'set', 5, 0, '40000000-0000-0000-0000-0000000000c1', 'host-bea')->>'status' = 'accepted', 'client B other player');
SELECT pg_temp.assert(public.write_score('21000000-0000-0000-0000-000000000002', NULL, '31000000-0000-0000-0000-000000000011', 3, 'set', 6, 0, '40000000-0000-0000-0000-0000000000c2', 'host-h3')->>'status' = 'accepted', 'client B hole 3');
SET LOCAL request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000012","role":"authenticated","is_anonymous":true}';
SELECT pg_temp.assert(public.write_score('21000000-0000-0000-0000-000000000002', NULL, '31000000-0000-0000-0000-000000000011', 3, 'set', 7, 0, '40000000-0000-0000-0000-0000000000c3', 'stale')->>'status' = 'conflict', 'stale offline edit conflicts');
SELECT pg_temp.assert((public.tournament_snapshot('21000000-0000-0000-0000-000000000002')->'rounds'->0->'groups'->0->'players'->0->'scores'->>0) = '4', 'client A sees own score');
SELECT pg_temp.assert((public.tournament_snapshot('21000000-0000-0000-0000-000000000002')->'rounds'->0->'groups'->0->'players'->1->'scores'->>0) = '5', 'client A sees client B');
SET LOCAL request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000011","role":"authenticated","is_anonymous":false}';
SELECT pg_temp.assert((public.tournament_snapshot('21000000-0000-0000-0000-000000000002')->'rounds'->0->'groups'->0->'players'->0->'scores'->>0) = '4', 'client B sees client A');
RESET ROLE;
SELECT pg_temp.assert((SELECT count(*) FROM public.score_events WHERE player_id = '31000000-0000-0000-0000-000000000011' AND hole = 2 AND cell_version IS NOT NULL) = 2, 'replay did not duplicate the queue');
SELECT pg_temp.assert((SELECT count(*) FROM public.score_events WHERE hole = 3 AND cell_version IS NOT NULL) = 1, 'conflict wrote nothing');

RESET ROLE;
INSERT INTO public.contest_memberships(contest_id, user_id, role, status)
VALUES ('21000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000014', 'scorer', 'approved');
INSERT INTO public.round_scorer_scopes(contest_id, round_id, group_id, user_id)
SELECT '21000000-0000-0000-0000-000000000002', r.id, g.id, '10000000-0000-0000-0000-000000000014'
FROM public.contest_rounds r JOIN public.contest_groups g ON g.round_id = r.id
WHERE r.contest_id = '21000000-0000-0000-0000-000000000002' AND r.round_number = 1;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000014","role":"authenticated","is_anonymous":true}';
SELECT pg_temp.assert(public.write_score('21000000-0000-0000-0000-000000000002', NULL, '31000000-0000-0000-0000-000000000012', 4, 'set', 4, 0, '40000000-0000-0000-0000-0000000000d1', 'scorer')->>'status' = 'accepted', 'scorer writes the group');

RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000011","role":"authenticated","is_anonymous":false}';
SELECT public.publish_shared_round('m3-watch', '{"completed":false,"players":[{"displayName":"Ada","scores":[4],"total":4,"toPar":0}],"games":[]}');
SELECT set_config('m3.watch', public.create_share_link('m3-watch'), true);
RESET ROLE;
SELECT set_config('m3.watch_contest', (SELECT contest_id::text FROM public.published_rounds WHERE local_id = 'm3-watch'), true);
UPDATE public.contests SET protocol = 1, sync_enabled = true WHERE id = current_setting('m3.watch_contest')::uuid;
SET LOCAL ROLE anon;
SET LOCAL request.jwt.claims = '{"role":"anon"}';
SELECT pg_temp.assert(public.get_shared_round(current_setting('m3.watch'))->'players'->0->>'displayName' = 'Ada', 'watch token can view');
DO $$ BEGIN
  BEGIN
    PERFORM public.write_score(current_setting('m3.watch_contest')::uuid, NULL, '31000000-0000-0000-0000-000000000011', 1, 'set', 4, 0, '40000000-0000-0000-0000-0000000000e1', 'watch');
    RAISE EXCEPTION 'watch token wrote';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000013","role":"authenticated","is_anonymous":true}';
SELECT pg_temp.assert(public.get_shared_round(current_setting('m3.watch'))->'players'->0->>'total' = '4', 'token holder view is not a membership');
DO $$ BEGIN
  BEGIN
    PERFORM public.write_score(current_setting('m3.watch_contest')::uuid, NULL, '31000000-0000-0000-0000-000000000011', 1, 'set', 4, 0, '40000000-0000-0000-0000-0000000000e2', 'watch2');
    RAISE EXCEPTION 'watch holder wrote';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.tournament_snapshot(current_setting('m3.watch_contest')::uuid);
    RAISE EXCEPTION 'watch holder snapped scores';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
UPDATE public.share_links SET revoked_at = now() WHERE contest_id = current_setting('m3.watch_contest')::uuid AND revoked_at IS NULL;
SET LOCAL ROLE anon;
SET LOCAL request.jwt.claims = '{"role":"anon"}';
DO $$ BEGIN
  BEGIN
    PERFORM public.get_shared_round(current_setting('m3.watch'));
    RAISE EXCEPTION 'revoked link viewed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'revoked link' THEN RAISE EXCEPTION 'M3_ASSERT revoked message %', SQLERRM; END IF;
  END;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000011","role":"authenticated","is_anonymous":false}';
SELECT set_config('m3.expired', public.create_share_link('m3-watch'), true);
RESET ROLE;
UPDATE public.share_links SET expires_at = now() - interval '1 minute'
WHERE contest_id = current_setting('m3.watch_contest')::uuid AND revoked_at IS NULL;
SET LOCAL ROLE anon;
SET LOCAL request.jwt.claims = '{"role":"anon"}';
DO $$ BEGIN
  BEGIN
    PERFORM public.get_shared_round(current_setting('m3.expired'));
    RAISE EXCEPTION 'expired link viewed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'expired link' THEN RAISE EXCEPTION 'M3_ASSERT expired message %', SQLERRM; END IF;
  END;
END $$;
SELECT pg_temp.assert(true, 'revoked and expired links denied');
RESET ROLE;
DO $$ BEGIN RAISE NOTICE 'M3_TEST_COUNT %', currval('pg_temp.m3_assert_seq'); END $$;
ROLLBACK;
