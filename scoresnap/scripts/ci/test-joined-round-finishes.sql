-- Disposable local Supabase stack only. Fixture writes and the migration roll back.
BEGIN;
INSERT INTO auth.users(id, created_at, is_anonymous) VALUES
 ('00000000-0000-0000-0000-000000005901', now(), false),
 ('00000000-0000-0000-0000-000000005902', now(), false),
 ('00000000-0000-0000-0000-000000005903', now(), false),
 ('00000000-0000-0000-0000-000000005904', now(), false),
 ('00000000-0000-0000-0000-000000005905', now(), false),
 ('00000000-0000-0000-0000-000000005906', now(), false),
 ('00000000-0000-0000-0000-000000005907', now(), true),
 ('00000000-0000-0000-0000-000000005908', now(), false),
 ('00000000-0000-0000-0000-000000005909', now(), false),
 ('00000000-0000-0000-0000-000000005910', now(), false);

INSERT INTO public.contests(id, owner_id, name, course, status, invite_code) VALUES
 ('00000000-0000-0000-0000-000000005921','00000000-0000-0000-0000-000000005901','Joined completion A','{}','active','JRF591'),
 ('00000000-0000-0000-0000-000000005922','00000000-0000-0000-0000-000000005908','Joined completion B','{}','active','JRF592'),
 ('00000000-0000-0000-0000-000000005923','00000000-0000-0000-0000-000000005908','Published joined finish','{}','active','JRF593');

INSERT INTO public.contest_players(id, contest_id, name) VALUES
 ('00000000-0000-0000-0000-000000005931','00000000-0000-0000-0000-000000005921','Approved player'),
 ('00000000-0000-0000-0000-000000005932','00000000-0000-0000-0000-000000005921','Pending player'),
 ('00000000-0000-0000-0000-000000005933','00000000-0000-0000-0000-000000005921','Revoked player'),
 ('00000000-0000-0000-0000-000000005934','00000000-0000-0000-0000-000000005921','Viewer player'),
 ('00000000-0000-0000-0000-000000005935','00000000-0000-0000-0000-000000005921','Scorer proxy'),
 ('00000000-0000-0000-0000-000000005936','00000000-0000-0000-0000-000000005921','Anonymous player'),
 ('00000000-0000-0000-0000-000000005937','00000000-0000-0000-0000-000000005922','Approved player later'),
 ('00000000-0000-0000-0000-000000005938','00000000-0000-0000-0000-000000005923','Published player'),
 ('00000000-0000-0000-0000-000000005940','00000000-0000-0000-0000-000000005921','Two-finish player');

INSERT INTO public.contest_memberships(contest_id, user_id, role, status, player_id) VALUES
 ('00000000-0000-0000-0000-000000005921','00000000-0000-0000-0000-000000005901','host','approved',NULL),
 ('00000000-0000-0000-0000-000000005921','00000000-0000-0000-0000-000000005902','player','approved','00000000-0000-0000-0000-000000005931'),
 ('00000000-0000-0000-0000-000000005921','00000000-0000-0000-0000-000000005903','player','pending','00000000-0000-0000-0000-000000005932'),
 ('00000000-0000-0000-0000-000000005921','00000000-0000-0000-0000-000000005904','player','revoked','00000000-0000-0000-0000-000000005933'),
 ('00000000-0000-0000-0000-000000005921','00000000-0000-0000-0000-000000005905','viewer','approved','00000000-0000-0000-0000-000000005934'),
 ('00000000-0000-0000-0000-000000005921','00000000-0000-0000-0000-000000005906','scorer','approved',NULL),
 ('00000000-0000-0000-0000-000000005921','00000000-0000-0000-0000-000000005907','player','approved','00000000-0000-0000-0000-000000005936'),
 ('00000000-0000-0000-0000-000000005921','00000000-0000-0000-0000-000000005910','player','approved','00000000-0000-0000-0000-000000005940'),
 ('00000000-0000-0000-0000-000000005922','00000000-0000-0000-0000-000000005902','player','approved','00000000-0000-0000-0000-000000005937'),
 ('00000000-0000-0000-0000-000000005923','00000000-0000-0000-0000-000000005910','player','approved','00000000-0000-0000-0000-000000005938');

-- Install the trigger before exercising both completion paths. The migration is
-- intentionally idempotent so this fixture can also compare view re-application.
INSERT INTO public.published_rounds(contest_id, owner_id, local_id, snapshot, ended_at) VALUES
 ('00000000-0000-0000-0000-000000005923','00000000-0000-0000-0000-000000005908','00000000-0000-0000-0000-000000005924','{}',NULL);
\i supabase/proposed/20261111120000_joined_round_finishes.sql

-- First observed finish timestamps are captured at the transition and must
-- survive subsequent metadata changes and completed -> active -> completed.
UPDATE public.contests SET status='completed', updated_at=now()-interval '3 hours'
 WHERE id='00000000-0000-0000-0000-000000005921';
UPDATE public.contests SET status='completed', updated_at=now()-interval '2 hours'
 WHERE id='00000000-0000-0000-0000-000000005922';
UPDATE public.published_rounds SET ended_at=now()-interval '4 hours'
 WHERE contest_id='00000000-0000-0000-0000-000000005923';
CREATE TEMP TABLE completion_event_before AS
 SELECT * FROM public.contest_finish_events
 WHERE contest_id IN ('00000000-0000-0000-0000-000000005921',
                     '00000000-0000-0000-0000-000000005922',
                     '00000000-0000-0000-0000-000000005923');
UPDATE public.contests SET name='Changed after completion', updated_at=now()+interval '1 hour'
 WHERE id='00000000-0000-0000-0000-000000005921';
UPDATE public.contests SET status='active', updated_at=now()+interval '2 hours'
 WHERE id='00000000-0000-0000-0000-000000005921';
UPDATE public.contests SET status='completed', updated_at=now()+interval '3 hours'
 WHERE id='00000000-0000-0000-0000-000000005921';
UPDATE public.published_rounds SET ended_at=now()+interval '2 hours'
 WHERE contest_id='00000000-0000-0000-0000-000000005923';

-- Snapshot after fixture event writes, then reapply the migration. This isolates
-- the migration's effect on activation_daily while the fixture verifies triggers.
CREATE TEMP TABLE activation_before AS SELECT * FROM public.activation_daily;
\i supabase/proposed/20261111120000_joined_round_finishes.sql
CREATE TEMP TABLE activation_after AS SELECT * FROM public.activation_daily;

DO $$ BEGIN
  IF (SELECT count(*) FROM public.contest_finish_events
      WHERE contest_id IN ('00000000-0000-0000-0000-000000005921',
                           '00000000-0000-0000-0000-000000005922',
                           '00000000-0000-0000-0000-000000005923')) <> 3 THEN
    RAISE EXCEPTION 'each completed contest/published round should create one finish event';
  END IF;
  IF EXISTS ((SELECT * FROM completion_event_before EXCEPT
              SELECT * FROM public.contest_finish_events WHERE contest_id IN
                ('00000000-0000-0000-0000-000000005921',
                 '00000000-0000-0000-0000-000000005922',
                 '00000000-0000-0000-0000-000000005923'))
             UNION ALL
             (SELECT * FROM public.contest_finish_events WHERE contest_id IN
                ('00000000-0000-0000-0000-000000005921',
                 '00000000-0000-0000-0000-000000005922',
                 '00000000-0000-0000-0000-000000005923')
              EXCEPT SELECT * FROM completion_event_before)) THEN
    RAISE EXCEPTION 'later contest edits/status toggles or published-round updates moved a first finish event';
  END IF;
  IF NOT EXISTS (
      SELECT 1 FROM public.contest_finish_events e
      JOIN public.first_round_finishes f
        ON f.user_id='00000000-0000-0000-0000-000000005901'
       AND e.contest_id='00000000-0000-0000-0000-000000005921'
       AND e.finished_at=f.finished_at
       AND e.source='contest_completed') THEN
    RAISE EXCEPTION 'contest event must use the completion timestamp captured by the existing owner-finish trigger';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.contest_finish_events
      WHERE contest_id='00000000-0000-0000-0000-000000005923'
        AND finished_at=now()-interval '4 hours'
        AND source='published_round_ended') THEN
    RAISE EXCEPTION 'published event must preserve the first ended_at timestamp';
  END IF;
  IF EXISTS ((SELECT * FROM activation_before EXCEPT SELECT * FROM activation_after)
             UNION ALL
             (SELECT * FROM activation_after EXCEPT SELECT * FROM activation_before)) THEN
    RAISE EXCEPTION 'applying joined_round_finishes changed activation_daily output';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.joined_round_finishes
      WHERE user_id='00000000-0000-0000-0000-000000005902'
        AND contest_id='00000000-0000-0000-0000-000000005921'
        AND NOT is_anonymous) THEN
    RAISE EXCEPTION 'approved player should receive the first completed-contest finish';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.joined_round_finishes
      WHERE user_id='00000000-0000-0000-0000-000000005906'
        AND contest_id='00000000-0000-0000-0000-000000005921') THEN
    RAISE EXCEPTION 'approved scorer should receive the joined finish';
  END IF;
  IF EXISTS (SELECT 1 FROM public.joined_round_finishes
      WHERE user_id IN ('00000000-0000-0000-0000-000000005901',
                        '00000000-0000-0000-0000-000000005903',
                        '00000000-0000-0000-0000-000000005904',
                        '00000000-0000-0000-0000-000000005905')) THEN
    RAISE EXCEPTION 'owner, pending, revoked, or viewer membership must not count';
  END IF;
  IF (SELECT count(*) FROM public.first_round_finishes
      WHERE user_id='00000000-0000-0000-0000-000000005901') <> 1 THEN
    RAISE EXCEPTION 'host owner remains exactly one row in first_round_finishes';
  END IF;
  IF (SELECT count(*) FROM public.joined_round_finishes
      WHERE user_id='00000000-0000-0000-0000-000000005902') <> 1 THEN
    RAISE EXCEPTION 'two eligible finishes must produce one first-finish row';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.joined_round_finishes
      WHERE user_id='00000000-0000-0000-0000-000000005910'
        AND contest_id='00000000-0000-0000-0000-000000005923'
        AND first_joined_finish_at=now()-interval '4 hours') THEN
    RAISE EXCEPTION 'the earliest published round finish should win for the member';
  END IF;
  IF (SELECT count(*) FROM public.joined_round_finishes
      WHERE user_id='00000000-0000-0000-0000-000000005910') <> 1 THEN
    RAISE EXCEPTION 'two finishes must expose only the earliest one for a member';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.joined_round_finishes
      WHERE user_id='00000000-0000-0000-0000-000000005907' AND is_anonymous) THEN
    RAISE EXCEPTION 'approved anonymous member must be included with is_anonymous=true';
  END IF;
  IF has_table_privilege('anon','public.joined_round_finishes','SELECT')
     OR has_table_privilege('authenticated','public.joined_round_finishes','SELECT') THEN
    RAISE EXCEPTION 'client roles must not read joined finish analytics';
  END IF;
  IF NOT has_table_privilege('service_role','public.joined_round_finishes','SELECT') THEN
    RAISE EXCEPTION 'service_role must read joined finish analytics';
  END IF;
END $$;
ROLLBACK;
SELECT 'PASS: joined finishes, first-per-user, membership filters, anonymous rows, privacy grants, activation_daily unchanged';
