-- Disposable local Supabase stack only. All fixture writes roll back.
BEGIN;
INSERT INTO auth.users(id) VALUES
 ('00000000-0000-0000-0000-000000000081'),
 ('00000000-0000-0000-0000-000000000082'),
 ('00000000-0000-0000-0000-000000000083');

INSERT INTO public.contests(id,owner_id,name,course,status,invite_code,protocol,sync_enabled) VALUES
 ('00000000-0000-0000-0000-000000000091','00000000-0000-0000-0000-000000000081','League Event One','{"holes":[{"num":1,"par":4}]}','active','LEAGUE1',1,true),
 ('00000000-0000-0000-0000-000000000092','00000000-0000-0000-0000-000000000081','League Event Two','{"holes":[{"num":1,"par":4}]}','active','LEAGUE2',1,true),
 ('00000000-0000-0000-0000-000000000093','00000000-0000-0000-0000-000000000081','League Event Three','{"holes":[{"num":1,"par":4}]}','active','LEAGUE3',1,true),
 ('00000000-0000-0000-0000-000000000094','00000000-0000-0000-0000-000000000083','Foreign Event','{"holes":[{"num":1,"par":4}]}','active','LEAGUE4',1,true);
INSERT INTO public.contest_players(id,contest_id,user_id,name,scores) VALUES
 ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000091','00000000-0000-0000-0000-000000000081','Host',ARRAY[0]),
 ('00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000091','00000000-0000-0000-0000-000000000082','Avery',ARRAY[0]),
 ('00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000092','00000000-0000-0000-0000-000000000081','Host',ARRAY[0]),
 ('00000000-0000-0000-0000-000000000202','00000000-0000-0000-0000-000000000092','00000000-0000-0000-0000-000000000082','Avery',ARRAY[0]),
 ('00000000-0000-0000-0000-000000000301','00000000-0000-0000-0000-000000000093','00000000-0000-0000-0000-000000000081','Host',ARRAY[0]),
 ('00000000-0000-0000-0000-000000000302','00000000-0000-0000-0000-000000000093',NULL,'Avery seat',ARRAY[0]);
INSERT INTO public.contest_memberships(contest_id,user_id,role,player_id,status) VALUES
 ('00000000-0000-0000-0000-000000000091','00000000-0000-0000-0000-000000000081','host',NULL,'approved'),
 ('00000000-0000-0000-0000-000000000091','00000000-0000-0000-0000-000000000082','player','00000000-0000-0000-0000-000000000102','approved'),
 ('00000000-0000-0000-0000-000000000092','00000000-0000-0000-0000-000000000081','host',NULL,'approved'),
 ('00000000-0000-0000-0000-000000000092','00000000-0000-0000-0000-000000000082','player','00000000-0000-0000-0000-000000000202','approved'),
 ('00000000-0000-0000-0000-000000000093','00000000-0000-0000-0000-000000000081','host',NULL,'approved');
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000081","role":"authenticated","is_anonymous":false}',true);
DO $$ DECLARE lid uuid; BEGIN
  lid := public.create_league('Weeknight League');
  PERFORM set_config('test.league_id',lid::text,true);
  PERFORM public.link_league_event(lid,'00000000-0000-0000-0000-000000000091');
  PERFORM public.link_league_event(lid,'00000000-0000-0000-0000-000000000092');
  PERFORM public.link_league_event(lid,'00000000-0000-0000-0000-000000000093');
  PERFORM public.link_league_event(lid,'00000000-0000-0000-0000-000000000091'); -- idempotent repeat
  IF (SELECT count(*) FROM public.league_events WHERE league_id=lid) <> 3 THEN RAISE EXCEPTION 'duplicate event link'; END IF;
  PERFORM public.map_league_event_player(lid,'00000000-0000-0000-0000-000000000093',
    (SELECT league_player_id FROM public.league_memberships WHERE league_id=lid AND user_id='00000000-0000-0000-0000-000000000082'),
    '00000000-0000-0000-0000-000000000302');
  PERFORM public.write_score('00000000-0000-0000-0000-000000000091',NULL,'00000000-0000-0000-0000-000000000102',1,'set',4,0,'00000000-0000-0000-0000-000000000401','league-event-one');
  PERFORM public.write_score('00000000-0000-0000-0000-000000000092',NULL,'00000000-0000-0000-0000-000000000202',1,'set',5,0,'00000000-0000-0000-0000-000000000402','league-event-two');
  IF jsonb_array_length(public.list_my_leagues()) <> 1 THEN RAISE EXCEPTION 'league list missing'; END IF;
  IF jsonb_array_length(public.list_league_roster(lid)) <> 2 THEN RAISE EXCEPTION 'roster import failed'; END IF;
  IF has_table_privilege('authenticated','public.league_memberships','SELECT') THEN RAISE EXCEPTION 'direct roster table access'; END IF;
  IF has_function_privilege('anon','public.list_my_leagues()','EXECUTE') THEN RAISE EXCEPTION 'anon list RPC grant'; END IF;
END $$;

SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000082","role":"authenticated","is_anonymous":false}',true);
DO $$ DECLARE lid uuid := current_setting('test.league_id')::uuid; events jsonb; item jsonb; BEGIN
  events := public.list_league_events(lid);
  IF jsonb_array_length(events) <> 3 THEN RAISE EXCEPTION 'league event list missing'; END IF;
  SELECT x INTO item FROM jsonb_array_elements(events) x WHERE x->>'id'='00000000-0000-0000-0000-000000000091';
  IF item->>'authorized' <> 'true' OR item#>>'{rounds,0,players,1,name}' <> 'Avery'
    OR item#>>'{rounds,0,players,1,holes,0,strokes}' <> '4' THEN RAISE EXCEPTION 'first event snapshot wrong: %',item; END IF;
  SELECT x INTO item FROM jsonb_array_elements(events) x WHERE x->>'id'='00000000-0000-0000-0000-000000000092';
  IF item#>>'{rounds,0,players,1,holes,0,strokes}' <> '5' THEN RAISE EXCEPTION 'second event score crossed/missing: %',item; END IF;
  SELECT x INTO item FROM jsonb_array_elements(events) x WHERE x->>'id'='00000000-0000-0000-0000-000000000093';
  IF item->>'authorized' <> 'false' OR item->'rounds' <> '[]'::jsonb THEN RAISE EXCEPTION 'unapproved event data leaked: %',item; END IF;
  IF (public.request_league_event_join(lid,'00000000-0000-0000-0000-000000000093')->>'status') <> 'pending' THEN RAISE EXCEPTION 'league join request not pending'; END IF;
  IF EXISTS(SELECT 1 FROM public.contest_memberships WHERE contest_id='00000000-0000-0000-0000-000000000093' AND user_id=auth.uid() AND status='approved') THEN RAISE EXCEPTION 'league membership bypassed event approval'; END IF;
  BEGIN PERFORM public.fetch_snapshot('00000000-0000-0000-0000-000000000093',0); RAISE EXCEPTION 'unapproved event snapshot was readable';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000083","role":"authenticated","is_anonymous":false}',true);
DO $$ DECLARE lid uuid := current_setting('test.league_id')::uuid; BEGIN
  BEGIN PERFORM public.list_league_events(lid); RAISE EXCEPTION 'foreign league was readable';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000083","role":"authenticated","is_anonymous":true}',true);
DO $$ BEGIN
  BEGIN PERFORM public.create_league('Guest league'); RAISE EXCEPTION 'anonymous league creation succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
SELECT 'PASS: league roster, two-event score isolation, event-scoped access, join approval and host/anon gates';
