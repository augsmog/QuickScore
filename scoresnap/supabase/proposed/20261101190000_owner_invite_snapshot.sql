-- OFFLINE PROPOSAL ONLY. Requires explicit live migration approval.
-- Predecessor: 20261031230000_restore_game_settings.sql (not the baseline snapshot).
-- CREATE OR REPLACE preserves the existing signature, grants and all prior fields.
BEGIN;
CREATE OR REPLACE FUNCTION public.fetch_snapshot(contest_id uuid, after_revision bigint DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c public.contests; result jsonb;
BEGIN
 SELECT * INTO c FROM public.contests WHERE id=$1 FOR UPDATE;
 IF auth.uid() IS NULL OR c.id IS NULL OR NOT (
  (c.owner_id=auth.uid() AND NOT coalesce((auth.jwt()->>'is_anonymous')::boolean,false)) OR
  EXISTS(SELECT 1 FROM public.contest_memberships m WHERE m.contest_id=$1 AND m.user_id=auth.uid() AND m.status='approved')
 ) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='FORBIDDEN'; END IF;
 IF $2 IS NULL OR $2<0 OR $2>c.sync_revision THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_REVISION'; END IF;
 SELECT jsonb_build_object('contest_id',c.id,'name',c.name,'capabilities',public.sync_capabilities(c.id),'course',public.sync_course(c.course),'protocol',c.protocol,'revision',c.sync_revision,'completed',c.status='completed','games',c.sync_games,'game_settings',c.sync_game_settings,
 'rounds',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'number',r.round_number,'name',r.name,'date',r.date,
 'course',public.sync_course(coalesce(r.course_data,c.course)), 'assignment_revision',r.assignment_revision,
 'groups',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'sort_order',g.sort_order) ORDER BY g.sort_order,g.id),'[]'::jsonb) FROM public.contest_groups g WHERE g.contest_id=c.id AND g.round_id=r.id),
 'players',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'displayName',p.name,'handicap',p.handicap,'status',p.status,'team',p.team,
 'group_id',(SELECT a.group_id FROM public.round_player_assignments a WHERE a.contest_id=c.id AND a.round_id=r.id AND a.player_id=p.id),
 'cells',(SELECT jsonb_agg(jsonb_build_object('hole',h,'version',coalesce(e.cell_version,0),'strokes',e.strokes) ORDER BY h)
 FROM generate_series(1,18) h LEFT JOIN LATERAL (
 SELECT x.cell_version,x.strokes FROM public.score_events x WHERE x.contest_id=c.id AND x.round_id=r.id AND x.player_id=p.id AND x.hole=h
 AND x.cell_version IS NOT NULL ORDER BY x.cell_version DESC LIMIT 1) e ON true)) ORDER BY p.sort_order,p.id),'[]'::jsonb)
 FROM public.contest_players p WHERE p.contest_id=c.id)) ORDER BY r.round_number),'[]'::jsonb)
 FROM public.contest_rounds r WHERE r.contest_id=c.id)) INTO result;
 -- Owner-only extension. A membership role, invite code or local cache is not owner proof.
 IF c.owner_id=auth.uid() AND NOT coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN
  result := result || jsonb_build_object('invite_code', c.invite_code);
 END IF;
 RETURN result || jsonb_build_object('id_map',(SELECT coalesce(jsonb_agg(jsonb_build_object('kind',m.kind,'local_id',m.local_id,'server_id',m.server_id) ORDER BY m.kind,m.local_id),'[]'::jsonb) FROM public.sync_id_map m WHERE m.contest_id=c.id));
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
