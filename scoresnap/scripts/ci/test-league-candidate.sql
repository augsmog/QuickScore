-- Disposable local Supabase stack only. All fixture writes roll back.
BEGIN;
INSERT INTO auth.users(id) VALUES
 ('00000000-0000-0000-0000-000000000081'),
 ('00000000-0000-0000-0000-000000000082'),
 ('00000000-0000-0000-0000-000000000083'),
 ('00000000-0000-0000-0000-000000000084'),
 ('00000000-0000-0000-0000-000000000085'),
 ('00000000-0000-0000-0000-000000000086');
UPDATE auth.users SET is_anonymous=true WHERE id='00000000-0000-0000-0000-000000000083';

INSERT INTO public.contests(id,owner_id,name,course,status,invite_code,protocol,sync_enabled) VALUES
 ('00000000-0000-0000-0000-000000000091','00000000-0000-0000-0000-000000000081','League Event One','{"holes":[{"num":1,"par":4}]}','active','LEAGUE1',1,true),
 ('00000000-0000-0000-0000-000000000092','00000000-0000-0000-0000-000000000081','League Event Two','{"holes":[{"num":1,"par":4}]}','active','LEAGUE2',1,true),
 ('00000000-0000-0000-0000-000000000093','00000000-0000-0000-0000-000000000081','League Event Three','{"holes":[{"num":1,"par":4}]}','active','LEAGUE3',1,true),
 ('00000000-0000-0000-0000-000000000095','00000000-0000-0000-0000-000000000081','League Event Four','{"holes":[{"num":1,"par":4}]}','active','LEAGUE5',1,true),
 ('00000000-0000-0000-0000-000000000094','00000000-0000-0000-0000-000000000083','Foreign Event','{"holes":[{"num":1,"par":4}]}','active','LEAGUE4',1,true);
INSERT INTO public.contest_players(id,contest_id,user_id,name,scores) VALUES
 ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000091','00000000-0000-0000-0000-000000000081','Host',ARRAY[0]),
 ('00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000091','00000000-0000-0000-0000-000000000082','Avery',ARRAY[0]),
 ('00000000-0000-0000-0000-000000000103','00000000-0000-0000-0000-000000000091','00000000-0000-0000-0000-000000000083','Guest',ARRAY[0]),
 ('00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000092','00000000-0000-0000-0000-000000000081','Host',ARRAY[0]),
 ('00000000-0000-0000-0000-000000000202','00000000-0000-0000-0000-000000000092','00000000-0000-0000-0000-000000000082','Avery',ARRAY[0]),
 ('00000000-0000-0000-0000-000000000203','00000000-0000-0000-0000-000000000092','00000000-0000-0000-0000-000000000083','Guest',ARRAY[0]),
 ('00000000-0000-0000-0000-000000000301','00000000-0000-0000-0000-000000000093','00000000-0000-0000-0000-000000000081','Host',ARRAY[0]),
 ('00000000-0000-0000-0000-000000000302','00000000-0000-0000-0000-000000000093',NULL,'Avery seat',ARRAY[0]),
 ('00000000-0000-0000-0000-000000000303','00000000-0000-0000-0000-000000000093',NULL,'Guest seat',ARRAY[0]),
 ('00000000-0000-0000-0000-000000000401','00000000-0000-0000-0000-000000000095','00000000-0000-0000-0000-000000000081','Host',ARRAY[0]),
 ('00000000-0000-0000-0000-000000000402','00000000-0000-0000-0000-000000000095','00000000-0000-0000-0000-000000000084','Jordan',ARRAY[0]);
INSERT INTO public.contest_memberships(contest_id,user_id,role,player_id,status) VALUES
 ('00000000-0000-0000-0000-000000000091','00000000-0000-0000-0000-000000000081','host',NULL,'approved'),
 ('00000000-0000-0000-0000-000000000091','00000000-0000-0000-0000-000000000082','player','00000000-0000-0000-0000-000000000102','approved'),
 ('00000000-0000-0000-0000-000000000091','00000000-0000-0000-0000-000000000083','player','00000000-0000-0000-0000-000000000103','approved'),
 ('00000000-0000-0000-0000-000000000092','00000000-0000-0000-0000-000000000081','host',NULL,'approved'),
 ('00000000-0000-0000-0000-000000000092','00000000-0000-0000-0000-000000000082','player','00000000-0000-0000-0000-000000000202','approved'),
 ('00000000-0000-0000-0000-000000000093','00000000-0000-0000-0000-000000000081','host',NULL,'approved'),
 ('00000000-0000-0000-0000-000000000095','00000000-0000-0000-0000-000000000081','host',NULL,'approved'),
 ('00000000-0000-0000-0000-000000000095','00000000-0000-0000-0000-000000000084','player','00000000-0000-0000-0000-000000000402','approved');
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000081","role":"authenticated","is_anonymous":false}',true);
DO $$ DECLARE lid uuid; BEGIN
  lid := public.create_league('Weeknight League');
  PERFORM set_config('test.league_id',lid::text,true);
  PERFORM public.link_league_event(lid,'00000000-0000-0000-0000-000000000091');
  PERFORM public.link_league_event(lid,'00000000-0000-0000-0000-000000000092');
  PERFORM public.link_league_event(lid,'00000000-0000-0000-0000-000000000093');
  PERFORM public.link_league_event(lid,'00000000-0000-0000-0000-000000000095');
  PERFORM public.link_league_event(lid,'00000000-0000-0000-0000-000000000091'); -- idempotent repeat
  IF (SELECT count(*) FROM public.league_events WHERE league_id=lid) <> 4 THEN RAISE EXCEPTION 'duplicate event link'; END IF;
  PERFORM public.map_league_event_player(lid,'00000000-0000-0000-0000-000000000093',
    (SELECT league_player_id FROM public.league_memberships WHERE league_id=lid AND user_id='00000000-0000-0000-0000-000000000082'),
    '00000000-0000-0000-0000-000000000302');
  PERFORM public.write_score('00000000-0000-0000-0000-000000000091',NULL,'00000000-0000-0000-0000-000000000102',1,'set',4,0,'00000000-0000-0000-0000-000000000401','league-event-one');
  PERFORM public.write_score('00000000-0000-0000-0000-000000000092',NULL,'00000000-0000-0000-0000-000000000202',1,'set',5,0,'00000000-0000-0000-0000-000000000402','league-event-two');
  IF jsonb_array_length(public.list_my_leagues()) <> 1 THEN RAISE EXCEPTION 'league list missing'; END IF;
  IF jsonb_array_length(public.list_league_roster(lid)) <> 4 THEN RAISE EXCEPTION 'roster import failed'; END IF;
  IF has_table_privilege('authenticated','public.league_memberships','SELECT') THEN RAISE EXCEPTION 'direct roster table access'; END IF;
  IF has_function_privilege('anon','public.list_my_leagues()','EXECUTE') THEN RAISE EXCEPTION 'anon list RPC grant'; END IF;
END $$;

-- API grants and RLS must work as PostgREST's authenticated role, not just as postgres.
SET LOCAL ROLE authenticated;
DO $$ DECLARE lid uuid := current_setting('test.league_id')::uuid; BEGIN
  IF jsonb_array_length(public.list_my_leagues()) <> 1 THEN RAISE EXCEPTION 'authenticated league list RPC denied'; END IF;
  IF jsonb_array_length(public.list_league_events(lid)) <> 4 THEN RAISE EXCEPTION 'authenticated event list RPC denied'; END IF;
END $$;
RESET ROLE;

-- A returning roster identity retains one league player ID across event links.
DO $$ DECLARE lid uuid := current_setting('test.league_id')::uuid; mapped integer; BEGIN
  SELECT count(DISTINCT p.league_player_id) INTO mapped FROM public.league_event_players p
    JOIN public.league_memberships m USING(league_id,league_player_id)
    WHERE p.league_id=lid AND m.user_id='00000000-0000-0000-0000-000000000082'
      AND p.contest_id IN ('00000000-0000-0000-0000-000000000091','00000000-0000-0000-0000-000000000092');
  IF mapped <> 1 OR (SELECT count(*) FROM public.league_event_players p
    JOIN public.league_memberships m USING(league_id,league_player_id)
    WHERE p.league_id=lid AND m.user_id='00000000-0000-0000-0000-000000000082'
      AND p.contest_id IN ('00000000-0000-0000-0000-000000000091','00000000-0000-0000-0000-000000000092')) <> 2 THEN
    RAISE EXCEPTION 'same member did not retain stable mapping across two events';
  END IF;
END $$;

SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000082","role":"authenticated","is_anonymous":false}',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE lid uuid := current_setting('test.league_id')::uuid; events jsonb; item jsonb; BEGIN
  events := public.list_league_events(lid);
  IF jsonb_array_length(events) <> 4 THEN RAISE EXCEPTION 'league event list missing'; END IF;
  SELECT x INTO item FROM jsonb_array_elements(events) x WHERE x->>'id'='00000000-0000-0000-0000-000000000091';
  IF item->>'authorized' <> 'true' OR item#>>'{rounds,0,players,0,name}' <> 'Avery'
    OR item#>>'{rounds,0,players,0,holes,0,strokes}' <> '4' THEN RAISE EXCEPTION 'first event snapshot wrong: %',item; END IF;
  SELECT x INTO item FROM jsonb_array_elements(events) x WHERE x->>'id'='00000000-0000-0000-0000-000000000092';
  IF item#>>'{rounds,0,players,0,holes,0,strokes}' <> '5' THEN RAISE EXCEPTION 'second event score crossed/missing: %',item; END IF;
  SELECT x INTO item FROM jsonb_array_elements(events) x WHERE x->>'id'='00000000-0000-0000-0000-000000000093';
  IF item->>'authorized' <> 'false' OR item->'rounds' <> '[]'::jsonb THEN RAISE EXCEPTION 'unapproved event data leaked: %',item; END IF;
  IF (public.request_league_event_join(lid,'00000000-0000-0000-0000-000000000093')->>'status') <> 'pending' THEN RAISE EXCEPTION 'league join request not pending'; END IF;
  BEGIN PERFORM public.fetch_snapshot('00000000-0000-0000-0000-000000000093',0); RAISE EXCEPTION 'unapproved event snapshot was readable';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000085","role":"authenticated","is_anonymous":false}',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE lid uuid := current_setting('test.league_id')::uuid; BEGIN
  BEGIN PERFORM public.list_league_events(lid); RAISE EXCEPTION 'foreign league was readable';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000083","role":"authenticated","is_anonymous":true}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM public.create_league('Guest league'); RAISE EXCEPTION 'anonymous league creation succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000081","role":"authenticated","is_anonymous":false}',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE lid uuid := current_setting('test.league_id')::uuid; guest_player uuid; BEGIN
  SELECT (x->>'league_player_id')::uuid INTO guest_player
    FROM jsonb_array_elements(public.list_league_roster(lid)) x WHERE x->>'display_name'='Guest';
  IF guest_player IS NULL THEN RAISE EXCEPTION 'guest was not imported into recurring roster'; END IF;
  PERFORM set_config('test.guest_league_player_id',guest_player::text,true);
  PERFORM public.map_league_event_player(lid,'00000000-0000-0000-0000-000000000093',guest_player,'00000000-0000-0000-0000-000000000303');
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000083","role":"authenticated","is_anonymous":true}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF (public.request_league_event_join(current_setting('test.league_id')::uuid,'00000000-0000-0000-0000-000000000093')->>'status') <> 'pending' THEN
    RAISE EXCEPTION 'guest event access request was not pending';
  END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000081","role":"authenticated","is_anonymous":false}',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE requests jsonb; request_id uuid; BEGIN
  requests := public.list_join_requests('00000000-0000-0000-0000-000000000093');
  SELECT (x->>'id')::uuid INTO request_id FROM jsonb_array_elements(requests) x
    WHERE x->>'requester'='00000000-0000-0000-0000-000000000083';
  IF request_id IS NULL THEN RAISE EXCEPTION 'host could not find guest request'; END IF;
  PERFORM public.decide_join_request(request_id,true,'00000000-0000-0000-0000-000000000303');
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000083","role":"authenticated","is_anonymous":true}',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE events jsonb; item jsonb; BEGIN
  events := public.list_league_events(current_setting('test.league_id')::uuid);
  SELECT x INTO item FROM jsonb_array_elements(events) x WHERE x->>'id'='00000000-0000-0000-0000-000000000093';
  IF item->>'authorized'<>'true' OR item->'rounds'='[]'::jsonb THEN RAISE EXCEPTION 'approved guest could not read mapped event'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000081","role":"authenticated","is_anonymous":false}',true);
SET LOCAL ROLE authenticated;
SELECT public.set_league_member_status(current_setting('test.league_id')::uuid,current_setting('test.guest_league_player_id')::uuid,false);
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000083","role":"authenticated","is_anonymous":true}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM public.list_league_events(current_setting('test.league_id')::uuid); RAISE EXCEPTION 'removed league member retained event access';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

INSERT INTO public.leagues(id,owner_id,name) VALUES ('00000000-0000-0000-0000-000000000086','00000000-0000-0000-0000-000000000085','Guest-only shared league');
INSERT INTO public.league_memberships(league_id,user_id,display_name) VALUES ('00000000-0000-0000-0000-000000000086','00000000-0000-0000-0000-000000000083','Guest');
DO $$ BEGIN
  BEGIN DELETE FROM auth.users WHERE id='00000000-0000-0000-0000-000000000085';
    RAISE EXCEPTION 'owner deletion orphaned a guest-shared league';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id='00000000-0000-0000-0000-000000000085') THEN RAISE EXCEPTION 'guest-only ownership transfer did not block deletion'; END IF;
END $$;
INSERT INTO public.leagues(id,owner_id,name) VALUES ('00000000-0000-0000-0000-000000000087','00000000-0000-0000-0000-000000000086','Owner-only league');
INSERT INTO public.league_memberships(league_id,user_id,display_name,role) VALUES ('00000000-0000-0000-0000-000000000087','00000000-0000-0000-0000-000000000086','Owner','host');
DO $$ BEGIN
  BEGIN DELETE FROM auth.users WHERE id='00000000-0000-0000-0000-000000000086';
    RAISE EXCEPTION 'owner-only league deletion was not blocked';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
  IF NOT EXISTS (SELECT 1 FROM public.leagues WHERE id='00000000-0000-0000-0000-000000000087' AND owner_id='00000000-0000-0000-0000-000000000086') THEN RAISE EXCEPTION 'owner-only league was orphaned'; END IF;
END $$;
SELECT public.purge_account('00000000-0000-0000-0000-000000000082');
DELETE FROM auth.users WHERE id='00000000-0000-0000-0000-000000000082';
DO $$ DECLARE lid uuid := current_setting('test.league_id')::uuid; BEGIN
  IF EXISTS(SELECT 1 FROM public.league_memberships m WHERE m.league_id=lid AND m.user_id='00000000-0000-0000-0000-000000000082') THEN RAISE EXCEPTION 'purged member remains in recurring roster'; END IF;
  IF (SELECT count(*) FROM public.league_events WHERE league_id=lid) <> 4 THEN RAISE EXCEPTION 'purging member removed shared events'; END IF;
  IF EXISTS(SELECT 1 FROM public.league_event_players p WHERE p.league_id=lid AND p.league_player_id NOT IN (SELECT m.league_player_id FROM public.league_memberships m WHERE m.league_id=lid)) THEN RAISE EXCEPTION 'purged member mapping remains'; END IF;
END $$;
SELECT public.purge_account('00000000-0000-0000-0000-000000000081');
DELETE FROM auth.users WHERE id='00000000-0000-0000-0000-000000000081';
DO $$ DECLARE lid uuid := current_setting('test.league_id')::uuid; BEGIN
  IF (SELECT owner_id FROM public.leagues WHERE id=lid) <> '00000000-0000-0000-0000-000000000084' THEN RAISE EXCEPTION 'shared league was not transferred to remaining member'; END IF;
  IF (SELECT role FROM public.league_memberships WHERE league_id=lid AND user_id='00000000-0000-0000-0000-000000000084') <> 'host' THEN RAISE EXCEPTION 'successor role not promoted'; END IF;
  IF (SELECT count(*) FROM public.league_events WHERE league_id=lid) <> 4 THEN RAISE EXCEPTION 'shared event history was not preserved'; END IF;
  IF (SELECT linked_by FROM public.league_events WHERE league_id=lid AND contest_id='00000000-0000-0000-0000-000000000095') IS NOT NULL THEN RAISE EXCEPTION 'deleted linker remained in the event audit FK'; END IF;
  IF (SELECT owner_id FROM public.contests WHERE id='00000000-0000-0000-0000-000000000095') <> '00000000-0000-0000-0000-000000000084' THEN RAISE EXCEPTION 'surviving event ownership was lost'; END IF;
END $$;
ROLLBACK;
SELECT 'PASS: league roster, two-event score isolation, event-scoped access, join approval and host/anon gates';
