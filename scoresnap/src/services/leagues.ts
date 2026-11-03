import { supabase } from '../db/supabase';

export interface League {
  id: string;
  name: string;
  role: 'host' | 'player';
  member_count: number;
  event_count: number;
}

export interface LeagueEvent {
  id: string;
  name: string;
  status: 'active' | 'completed';
  created_at: string;
  authorized: boolean;
  rounds: Array<{
    number: string;
    players: Array<{ name: string; holes: Array<{ hole: number; strokes: number | null }> }>;
  }>;
}

async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw error;
  return data as T;
}

export const leagueService = {
  list: () => rpc<League[]>('list_my_leagues'),
  create: (name: string) => {
    const normalized = name.trim();
    if (!normalized || normalized.length > 80) throw new Error('Enter a league name up to 80 characters.');
    return rpc<string>('create_league', { p_league_name: normalized });
  },
  linkEvent: (leagueId: string, contestId: string) =>
    rpc<{ status: 'linked'; mapped_players: number }>('link_league_event', { p_league_id: leagueId, p_contest_id: contestId }),
  events: (leagueId: string) => rpc<LeagueEvent[]>('list_league_events', { p_league_id: leagueId }),
  roster: (leagueId: string) => rpc<Array<{ league_player_id: string; display_name: string; role: string; status: string }>>('list_league_roster', { p_league_id: leagueId }),
  setMemberActive: (leagueId: string, playerId: string, active: boolean) =>
    rpc<{ status: string }>('set_league_member_status', { p_league_id: leagueId, p_league_player_id: playerId, p_active: active }),
  requestEventJoin: (leagueId: string, contestId: string) =>
    rpc<{ status: 'pending' }>('request_league_event_join', { p_league_id: leagueId, p_contest_id: contestId }),
  mapOptions: (leagueId: string, contestId: string) => rpc<{
    roster: Array<{ id: string; name: string }>;
    players: Array<{ id: string; name: string }>;
    mappings: Array<{ league_player_id: string; contest_player_id: string }>;
  }>('list_league_event_map_options', { p_league_id: leagueId, p_contest_id: contestId }),
  mapPlayer: (leagueId: string, contestId: string, leaguePlayerId: string, contestPlayerId: string) =>
    rpc<{ status: 'mapped' }>('map_league_event_player', {
      p_league_id: leagueId, p_contest_id: contestId, p_league_player_id: leaguePlayerId, p_contest_player_id: contestPlayerId,
    }),
};
