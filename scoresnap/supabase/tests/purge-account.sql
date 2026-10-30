-- Guest names, exact referral tokens, host stamp, and a failed purge that rolls back.
-- The whole script rolls back. It does not leave rows or the failure trigger behind.
BEGIN;
CREATE TEMP SEQUENCE purge_assert_seq;
CREATE FUNCTION pg_temp.assert(ok boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'PURGE_ASSERT %', label; END IF;
  PERFORM nextval('pg_temp.purge_assert_seq');
END $$;

SELECT pg_temp.assert(NOT has_function_privilege('anon', 'public.purge_account(uuid)', 'execute'), 'anon cannot purge');
SELECT pg_temp.assert(NOT has_function_privilege('authenticated', 'public.purge_account(uuid)', 'execute'), 'authenticated cannot purge');
SELECT pg_temp.assert(has_function_privilege('service_role', 'public.purge_account(uuid)', 'execute'), 'service role can purge');
SELECT pg_temp.assert(public.purge_replace_referral('Provider: email | Referral: organic | Code: SS-AUG10', 'SS-AUG10') = 'Provider: email | Referral: organic | Code: [deleted]', 'actual code SS-AUG10');
SELECT pg_temp.assert(public.purge_replace_referral('Code: SS-AUG100', 'SS-AUG10') = 'Code: SS-AUG100', 'longer token stays');
SELECT pg_temp.assert(public.purge_replace_referral('Referral: friend.ref | Code: SS-AUG10', 'friend.ref') = 'Referral: [deleted] | Code: SS-AUG10', 'dotted code');
SELECT pg_temp.assert(public.purge_replace_referral('Code: SS-AUG10', 'SS-AUG1') = 'Code: SS-AUG10', 'shorter code does not eat SS-AUG10');

INSERT INTO auth.users(id, email) VALUES
 ('10000000-0000-0000-0000-0000000000a1', 'augie@example.com'),
 ('10000000-0000-0000-0000-0000000000b1', 'blair@example.com'),
 ('10000000-0000-0000-0000-0000000000c1', 'casey@example.com');
UPDATE public.profiles SET referral_code = 'SS-AUG10', email = 'augie@example.com' WHERE id = '10000000-0000-0000-0000-0000000000a1';
UPDATE public.profiles SET referral_code = 'SS-BLAIR', referred_by = 'SS-AUG10', email = 'blair@example.com' WHERE id = '10000000-0000-0000-0000-0000000000b1';
UPDATE public.profiles SET email = 'casey@example.com' WHERE id = '10000000-0000-0000-0000-0000000000c1';

INSERT INTO public.contests(id, owner_id, course, protocol, sync_enabled, invite_code) VALUES
 ('22000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-0000000000a1', '{}', 0, false, 'PURGEA'),
 ('22000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-0000000000a1', '{}', 0, false, 'PURGEB'),
 ('22000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-0000000000c1', '{}', 0, false, 'PURGEC'),
 ('22000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-0000000000b1', '{}', 1, true, 'PURGED');

INSERT INTO public.contest_players(id, contest_id, user_id, name, scores) VALUES
 ('33000000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-0000000000a1', 'Augie', '{4}'),
 ('33000000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000001', NULL, 'Sam', '{6}'),
 ('33000000-0000-0000-0000-000000000003', '22000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-0000000000b1', 'Blair', '{5}'),
 ('33000000-0000-0000-0000-000000000004', '22000000-0000-0000-0000-000000000002', NULL, 'Pat', '{3}'),
 ('33000000-0000-0000-0000-000000000005', '22000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-0000000000c1', 'Casey', '{4}');
INSERT INTO public.contest_memberships(contest_id, user_id, role, player_id, status) VALUES
 ('22000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-0000000000b1', 'player', '33000000-0000-0000-0000-000000000003', 'approved');

INSERT INTO public.published_rounds(contest_id, owner_id, local_id, snapshot) VALUES
 ('22000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-0000000000a1', 'shared-1',
  '{"players":[{"displayName":"Augie","scores":[4]},{"displayName":"Sam","scores":[6]}]}');
INSERT INTO public.round_messages(contest_id, display_name, body, sender_session_hash) VALUES
 ('22000000-0000-0000-0000-000000000001', 'Augie', 'mine', repeat('a', 64)),
 ('22000000-0000-0000-0000-000000000001', 'Sam', 'typed', repeat('b', 64));

INSERT INTO public.score_events(contest_id, round_id, player_id, hole, strokes, entered_by)
SELECT '22000000-0000-0000-0000-000000000001', r.id, '33000000-0000-0000-0000-000000000002', 1, 6, '10000000-0000-0000-0000-0000000000a1'
FROM public.contest_rounds r
WHERE r.contest_id = '22000000-0000-0000-0000-000000000001' AND r.round_number = 1;
INSERT INTO public.score_events(contest_id, round_id, player_id, hole, strokes, entered_by)
SELECT '22000000-0000-0000-0000-000000000002', r.id, '33000000-0000-0000-0000-000000000004', 1, 5, '10000000-0000-0000-0000-0000000000a1'
FROM public.contest_rounds r
WHERE r.contest_id = '22000000-0000-0000-0000-000000000002' AND r.round_number = 1;
INSERT INTO public.score_events(contest_id, round_id, player_id, hole, strokes, entered_by)
SELECT '22000000-0000-0000-0000-000000000003', r.id, '33000000-0000-0000-0000-000000000005', 1, 4, '10000000-0000-0000-0000-0000000000c1'
FROM public.contest_rounds r
WHERE r.contest_id = '22000000-0000-0000-0000-000000000003' AND r.round_number = 1;

INSERT INTO public.automation_log(title, category, details) VALUES
 ('Signup', 'signup', 'Provider: email | Referral: organic | Code: SS-AUG10'),
 ('Other', 'signup', 'Code: SS-AUG1'),
 ('Longer', 'signup', 'Code: SS-AUG100'),
 ('Dotted', 'signup', 'Referral: friend.ref');
INSERT INTO public.marketing_events(event_name, user_id, campaign, properties) VALUES
 ('referral', '10000000-0000-0000-0000-0000000000b1', 'SS-AUG10', '{"referred_by":"SS-AUG10","referral_code":"SS-AUG10","note":"keep"}');

SELECT public.purge_account('10000000-0000-0000-0000-0000000000a1');

SELECT pg_temp.assert(
  (SELECT name FROM public.contest_players WHERE id = '33000000-0000-0000-0000-000000000002') = 'Sam'
  AND (SELECT user_id FROM public.contest_players WHERE id = '33000000-0000-0000-0000-000000000002') IS NULL
  AND (SELECT scores FROM public.contest_players WHERE id = '33000000-0000-0000-0000-000000000002') = '{6}',
  'guest Sam keeps his name and scores');
SELECT pg_temp.assert(
  (SELECT name FROM public.contest_players WHERE id = '33000000-0000-0000-0000-000000000001') = 'Deleted player'
  AND (SELECT user_id FROM public.contest_players WHERE id = '33000000-0000-0000-0000-000000000001') IS NULL
  AND (SELECT scores FROM public.contest_players WHERE id = '33000000-0000-0000-0000-000000000001') = '{4}',
  'stamped host becomes Deleted player');
SELECT pg_temp.assert(
  (SELECT snapshot->'players'->1->>'displayName' FROM public.published_rounds WHERE contest_id = '22000000-0000-0000-0000-000000000001') = 'Sam'
  AND (SELECT snapshot->'players'->1->'scores' FROM public.published_rounds WHERE contest_id = '22000000-0000-0000-0000-000000000001') = '[6]'::jsonb
  AND (SELECT snapshot->'players'->0->>'displayName' FROM public.published_rounds WHERE contest_id = '22000000-0000-0000-0000-000000000001') = 'Deleted player',
  'snapshot keeps Sam and relabels the host');
SELECT pg_temp.assert(
  (SELECT body FROM public.round_messages WHERE contest_id = '22000000-0000-0000-0000-000000000001' AND display_name = 'Sam') = 'typed'
  AND NOT EXISTS (
    SELECT 1 FROM public.round_messages
    WHERE contest_id = '22000000-0000-0000-0000-000000000001' AND display_name = 'Augie'
  ),
  'chat keeps Sam');
SELECT pg_temp.assert(
  NOT EXISTS (SELECT 1 FROM public.contests WHERE id = '22000000-0000-0000-0000-000000000002')
  AND NOT EXISTS (SELECT 1 FROM public.contest_players WHERE id = '33000000-0000-0000-0000-000000000004')
  AND NOT EXISTS (SELECT 1 FROM public.score_events WHERE contest_id = '22000000-0000-0000-0000-000000000002'),
  'contest with no other account is deleted');
SELECT pg_temp.assert(
  (SELECT owner_id FROM public.contests WHERE id = '22000000-0000-0000-0000-000000000001') = '10000000-0000-0000-0000-0000000000b1'
  AND (SELECT entered_by FROM public.score_events WHERE contest_id = '22000000-0000-0000-0000-000000000001') = '10000000-0000-0000-0000-0000000000b1'
  AND (SELECT strokes FROM public.score_events WHERE contest_id = '22000000-0000-0000-0000-000000000001') = 6,
  'shared score moves to the other account');
SELECT pg_temp.assert(
  (SELECT details FROM public.automation_log WHERE title = 'Signup') = 'Provider: email | Referral: organic | Code: [deleted]'
  AND (SELECT details FROM public.automation_log WHERE title = 'Other') = 'Code: SS-AUG1'
  AND (SELECT details FROM public.automation_log WHERE title = 'Longer') = 'Code: SS-AUG100'
  AND (SELECT details FROM public.automation_log WHERE title = 'Dotted') = 'Referral: friend.ref',
  'referral scrub matches the whole code');
SELECT pg_temp.assert(
  (SELECT referred_by FROM public.profiles WHERE id = '10000000-0000-0000-0000-0000000000b1') IS NULL
  AND (SELECT properties->>'referred_by' FROM public.marketing_events WHERE event_name = 'referral') IS NULL
  AND (SELECT properties->>'referral_code' FROM public.marketing_events WHERE event_name = 'referral') IS NULL
  AND (SELECT properties->>'note' FROM public.marketing_events WHERE event_name = 'referral') = 'keep'
  AND (SELECT campaign FROM public.marketing_events WHERE event_name = 'referral') IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = '10000000-0000-0000-0000-0000000000a1'),
  'referral columns cleared and caller profile deleted');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-0000000000b1","role":"authenticated","is_anonymous":false}', true);
SELECT public.sync_round_bundle('22000000-0000-0000-0000-000000000004', jsonb_build_object(
  'local_id', 'round-local', 'number', 1, 'name', 'Round 1',
  'groups', jsonb_build_array(jsonb_build_object(
    'local_id', 'group-local', 'name', 'Group 1',
    'players', jsonb_build_array(
      jsonb_build_object('local_id', 'host', 'server_id', '33000000-0000-0000-0000-000000000011', 'name', 'Blair', 'handicap', 5, 'host', true),
      jsonb_build_object('local_id', 'guest', 'server_id', '33000000-0000-0000-0000-000000000012', 'name', 'Sam', 'handicap', 8)
    )
  ))
));
RESET ROLE;
SELECT pg_temp.assert(
  (SELECT user_id FROM public.contest_players WHERE id = '33000000-0000-0000-0000-000000000011') = '10000000-0000-0000-0000-0000000000b1'
  AND (SELECT user_id FROM public.contest_players WHERE id = '33000000-0000-0000-0000-000000000012') IS NULL,
  'sync stamps only the host row');

UPDATE public.contest_players SET user_id = '10000000-0000-0000-0000-0000000000a1' WHERE id = '33000000-0000-0000-0000-000000000011';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-0000000000b1","role":"authenticated","is_anonymous":false}', true);
SELECT public.sync_round_bundle('22000000-0000-0000-0000-000000000004', jsonb_build_object(
  'local_id', 'round-local', 'number', 1, 'name', 'Round 1',
  'groups', jsonb_build_array(jsonb_build_object(
    'local_id', 'group-local', 'name', 'Group 1',
    'players', jsonb_build_array(
      jsonb_build_object('local_id', 'host', 'server_id', '33000000-0000-0000-0000-000000000011', 'name', 'Blair', 'handicap', 5, 'host', true),
      jsonb_build_object('local_id', 'guest', 'server_id', '33000000-0000-0000-0000-000000000012', 'name', 'Sam', 'handicap', 8)
    )
  ))
));
RESET ROLE;
SELECT pg_temp.assert(
  (SELECT user_id FROM public.contest_players WHERE id = '33000000-0000-0000-0000-000000000011') = '10000000-0000-0000-0000-0000000000a1',
  'host flag does not take over another account');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-0000000000b1","role":"authenticated","is_anonymous":false}', true);
DO $$ BEGIN
  BEGIN
    PERFORM public.sync_round_bundle('22000000-0000-0000-0000-000000000004', jsonb_build_object(
      'number', 1, 'name', 'Round 1',
      'groups', jsonb_build_array(jsonb_build_object(
        'local_id', 'group-local', 'name', 'Group 1',
        'players', jsonb_build_array(
          jsonb_build_object('local_id', 'host', 'name', 'Blair', 'host', true),
          jsonb_build_object('local_id', 'second', 'name', 'Other', 'host', true)
        )
      ))
    ));
    RAISE EXCEPTION 'two hosts accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END $$;
RESET ROLE;

CREATE FUNCTION pg_temp.purge_fail_profile() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.id = '10000000-0000-0000-0000-0000000000c1' THEN
    RAISE EXCEPTION 'PURGE_TEST_FAIL';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER purge_fail_profile BEFORE DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION pg_temp.purge_fail_profile();

DO $$
DECLARE
  scores int;
  contests int;
  profiles int;
  strokes int;
BEGIN
  BEGIN
    PERFORM public.purge_account('10000000-0000-0000-0000-0000000000c1');
    RAISE EXCEPTION 'purge should have failed';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%PURGE_TEST_FAIL%' THEN
        RAISE;
      END IF;
  END;
  SELECT count(*) INTO scores FROM public.score_events WHERE contest_id = '22000000-0000-0000-0000-000000000003';
  SELECT count(*) INTO contests FROM public.contests WHERE id = '22000000-0000-0000-0000-000000000003';
  SELECT count(*) INTO profiles FROM public.profiles WHERE id = '10000000-0000-0000-0000-0000000000c1';
  SELECT e.strokes INTO strokes FROM public.score_events e WHERE e.contest_id = '22000000-0000-0000-0000-000000000003';
  IF scores <> 1 OR contests <> 1 OR profiles <> 1 OR strokes <> 4 THEN
    RAISE EXCEPTION 'purge left a partial delete scores=% contests=% profiles=% strokes=%', scores, contests, profiles, strokes;
  END IF;
END $$;
SELECT pg_temp.assert(
  EXISTS (SELECT 1 FROM public.score_events WHERE contest_id = '22000000-0000-0000-0000-000000000003')
  AND EXISTS (SELECT 1 FROM public.contests WHERE id = '22000000-0000-0000-0000-000000000003')
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = '10000000-0000-0000-0000-0000000000c1'),
  'failed purge leaves the score, contest, and profile');
SELECT pg_temp.assert((SELECT last_value FROM pg_temp.purge_assert_seq) >= 14, 'purge asserts ran');
ROLLBACK;
