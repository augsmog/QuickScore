-- Committed pre-M4b receipt, representing a score accepted with a lost response.
INSERT INTO auth.users(id) VALUES('61000000-0000-0000-0000-000000000001');
INSERT INTO public.contests(id,owner_id,course,invite_code,protocol,sync_enabled) VALUES('62000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000001','{}','M4BUPG',0,false);
INSERT INTO public.contest_players(id,contest_id,name) VALUES('63000000-0000-0000-0000-000000000001','62000000-0000-0000-0000-000000000001','Upgrade');
INSERT INTO public.published_rounds(contest_id,owner_id,local_id,snapshot) VALUES('62000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000001','m4b-upgrade','{"players":[],"games":[]}');
UPDATE public.contests SET protocol=1,sync_enabled=true WHERE id='62000000-0000-0000-0000-000000000001';
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"61000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":false}';
SELECT public.write_score('62000000-0000-0000-0000-000000000001',NULL,'63000000-0000-0000-0000-000000000001',1,'set',4,0,'64000000-0000-0000-0000-000000000001','pre-m4b');
RESET ROLE;
