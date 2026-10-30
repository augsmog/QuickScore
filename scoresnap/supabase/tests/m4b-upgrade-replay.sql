SET ROLE authenticated;
SET request.jwt.claims='{"sub":"61000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":false}';
DO $$ BEGIN
 IF public.write_score('62000000-0000-0000-0000-000000000001',NULL,'63000000-0000-0000-0000-000000000001',1,'set',4,0,'64000000-0000-0000-0000-000000000001','pre-m4b')->>'status'<>'accepted' THEN
 RAISE EXCEPTION 'M4B_ASSERT: pre-M4b receipt replay failed'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.score_events WHERE contest_id='62000000-0000-0000-0000-000000000001')<>1 THEN
 RAISE EXCEPTION 'M4B_ASSERT: upgrade duplicated an accepted score'; END IF;
 IF (SELECT scores[1] FROM public.contest_players WHERE id='63000000-0000-0000-0000-000000000001') IS DISTINCT FROM 4 OR
 (SELECT snapshot->'players'->0->'scores'->>0 FROM public.published_rounds WHERE local_id='m4b-upgrade') IS DISTINCT FROM '4' THEN
 RAISE EXCEPTION 'M4B_ASSERT: seeded upgrade failed canonical cache rebuild'; END IF;
END $$;
DELETE FROM public.contests WHERE id='62000000-0000-0000-0000-000000000001';
DELETE FROM auth.users WHERE id='61000000-0000-0000-0000-000000000001';
