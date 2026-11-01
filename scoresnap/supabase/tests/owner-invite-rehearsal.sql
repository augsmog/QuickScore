-- Called only by owner-invite-rehearsal.sh on a freshly reset disposable PG17 DB.
-- Do not wrap this file in a transaction: exact migration files commit themselves.
\set ON_ERROR_STOP on
CREATE FUNCTION pg_temp.aug331_assert(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'AUG331_ASSERT: %', label; END IF; END $$;
CREATE FUNCTION pg_temp.aug331_denied(sql text, state text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE sql; EXCEPTION WHEN OTHERS THEN IF SQLSTATE=state THEN RETURN; END IF; RAISE; END;
 RAISE EXCEPTION 'AUG331_ASSERT: expected denial %', state;
END $$;
CREATE FUNCTION pg_temp.aug331_routine(r regprocedure) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('definition',pg_get_functiondef(p.oid),'body',p.prosrc,'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'security_definer',p.prosecdef,'config',p.proconfig,'arguments',pg_get_function_arguments(p.oid),'result',pg_get_function_result(p.oid)) FROM pg_proc p WHERE p.oid=r
$$;
GRANT EXECUTE ON FUNCTION pg_temp.aug331_assert(boolean,text),pg_temp.aug331_denied(text,text) TO authenticated,anon,service_role;
SELECT pg_temp.aug331_assert(NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.contests'::regclass AND attname IN ('sync_games','sync_game_settings') AND NOT attisdropped), 'PRISTINE_PREDECESSOR_COLUMNS');
SELECT pg_temp.aug331_assert((SELECT count(*)=2 AND bool_and(md5(prosrc)=(:'expected_bodies'::jsonb->>proname)) FROM pg_proc WHERE oid IN ('public.fetch_snapshot(uuid,bigint)'::regprocedure,'public.sync_round_bundle(uuid,jsonb)'::regprocedure)), 'PRISTINE_PREDECESSOR_BODIES');
SELECT pg_temp.aug331_routine('public.fetch_snapshot(uuid,bigint)') AS initial_snapshot, pg_temp.aug331_routine('public.sync_round_bundle(uuid,jsonb)') AS initial_bundle \gset
SELECT pg_temp.aug331_assert((SELECT bool_and(pg_get_userbyid(p.proowner)='postgres' AND p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog'] AND has_function_privilege('authenticated',p.oid,'EXECUTE') AND has_function_privilege('service_role',p.oid,'EXECUTE') AND NOT has_function_privilege('anon',p.oid,'EXECUTE')) FROM pg_proc p WHERE p.oid IN ('public.fetch_snapshot(uuid,bigint)'::regprocedure,'public.sync_round_bundle(uuid,jsonb)'::regprocedure)), 'PRISTINE_PREDECESSOR_SECURITY');
SELECT pg_temp.aug331_assert(NOT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid IN ('public.fetch_snapshot(uuid,bigint)'::regprocedure,'public.sync_round_bundle(uuid,jsonb)'::regprocedure) AND (a.grantor<>p.proowner OR (a.grantee<>p.proowner AND (a.grantee NOT IN ('authenticated'::regrole,'service_role'::regrole) OR a.is_grantable)))), 'PRISTINE_PREDECESSOR_ACL');
\ir ../proposed/20261031230000_restore_game_settings.sql
SELECT pg_temp.aug331_routine('public.fetch_snapshot(uuid,bigint)') AS predecessor_routine \gset
SELECT pg_temp.aug331_assert((:'predecessor_routine'::jsonb - 'definition' - 'body') = (:'initial_snapshot'::jsonb - 'definition' - 'body'), 'PREDECESSOR_ACL_SECURITY');
\set capture_predecessor true
\set expect_invite false
\set stage predecessor
\ir owner-invite-probes.sql
\set capture_predecessor false
\ir ../proposed/20261101190000_owner_invite_snapshot.sql
SELECT pg_temp.aug331_assert((pg_temp.aug331_routine('public.fetch_snapshot(uuid,bigint)') - 'definition' - 'body') = (:'predecessor_routine'::jsonb - 'definition' - 'body'), 'FORWARD_ACL_SECURITY');
\set expect_invite true
\set stage forward
\ir owner-invite-probes.sql
\echo PASS: AUG331 forward owner/access/shape probes
\ir ../rollbacks/20261101190000_owner_invite_snapshot.sql
SELECT pg_temp.aug331_assert(pg_temp.aug331_routine('public.fetch_snapshot(uuid,bigint)') = :'predecessor_routine'::jsonb, 'ROLLBACK_ROUTINE');
\set expect_invite false
\set stage rollback
\ir owner-invite-probes.sql
\echo PASS: AUG331 exact predecessor rollback
-- The wrong predecessor (without game settings) must trip the same exact-tuple gate.
CREATE FUNCTION pg_temp.aug331_bad_rollback(expected jsonb) RETURNS void LANGUAGE plpgsql AS $$
DECLARE original text; mutated text;
BEGIN
 BEGIN
  original := pg_get_functiondef('public.fetch_snapshot(uuid,bigint)'::regprocedure);
  mutated := replace(original,'''games'',c.sync_games,''game_settings'',c.sync_game_settings','''games'',''[]''::jsonb');
  PERFORM pg_temp.aug331_assert(mutated<>original,'ROLLBACK_MUTATION_APPLIED');
  EXECUTE mutated;
  PERFORM pg_temp.aug331_assert(pg_temp.aug331_routine('public.fetch_snapshot(uuid,bigint)')=expected,'ROLLBACK_ROUTINE');
  RAISE EXCEPTION 'AUG331_ASSERT: rollback mutant unexpectedly passed';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'AUG331_ASSERT: ROLLBACK_ROUTINE' THEN RAISE; END IF;
 END; -- subtransaction rolls back the mutant only on that named semantic failure
END $$;
SELECT pg_temp.aug331_bad_rollback(:'predecessor_routine'::jsonb);
SELECT pg_temp.aug331_assert(pg_temp.aug331_routine('public.fetch_snapshot(uuid,bigint)') = :'predecessor_routine'::jsonb, 'MUTANT_RESTORATION');
\echo PASS: AUG331 rollback mutant rejected
\ir ../proposed/20261101190000_owner_invite_snapshot.sql
\set expect_invite true
\set stage reapply
\ir owner-invite-probes.sql
\echo PASS: AUG331 reapply owner/access/shape probes
\ir ../rollbacks/20261101190000_owner_invite_snapshot.sql
SELECT pg_temp.aug331_assert(pg_temp.aug331_routine('public.fetch_snapshot(uuid,bigint)') = :'predecessor_routine'::jsonb, 'REAPPLY_ROLLBACK_ROUTINE');
\ir ../rollbacks/20261031230000_restore_game_settings.sql
SELECT pg_temp.aug331_assert(pg_temp.aug331_routine('public.fetch_snapshot(uuid,bigint)') = :'initial_snapshot'::jsonb AND pg_temp.aug331_routine('public.sync_round_bundle(uuid,jsonb)') = :'initial_bundle'::jsonb, 'PREREQUISITE_ROLLBACK_ROUTINES');
SELECT pg_temp.aug331_assert(NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.contests'::regclass AND attname IN ('sync_games','sync_game_settings') AND NOT attisdropped), 'PREREQUISITE_ROLLBACK_COLUMNS');
SELECT pg_temp.aug331_assert(NOT EXISTS(SELECT 1 FROM auth.users WHERE id::text LIKE '33110000-%') AND NOT EXISTS(SELECT 1 FROM public.contests WHERE id::text LIKE '33120000-%'), 'FIXTURE_CLEANUP');
\echo PASS: AUG331 prerequisite rollback
