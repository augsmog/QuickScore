import type { Contest } from '../stores/contest-store';
import type { SyncSnapshotV1 } from '../../../docs/xdevice/sync-contract-v1';
import { snapshotOwnerInviteCode } from './owner-invite';
/** Called only after host proof and an authorized snapshot. No enrollment or score writes. */
export function restoreOwnerContest(s: SyncSnapshotV1): Contest {
  const local = (kind: string, id: string) => s.id_map.find(m => m.kind === kind && m.server_id === id)?.local_id ?? id;
  const course = (c: SyncSnapshotV1['course']) => ({ name: c.name ?? 'Course', holes: c.holes.map((h, i) => ({ num: h.num ?? i + 1, par: h.par ?? 4, hcp: h.hcp ?? i + 1, yards: h.yards ?? 0 })) });
  const rounds = s.rounds.map(r => ({ id: local('round', r.id), number: r.number, name: r.name, course: course(r.course), groups: r.groups.map(g => ({ id: local('group', g.id), name: g.name, players: r.players.filter(p => p.group_id === g.id).map(p => ({ id: local('player', p.id), name: p.displayName, handicap: p.handicap, team: p.team, scores: Array.from({ length: 18 }, (_, i) => p.cells.find(c => c.hole === i + 1)?.strokes ?? 0) })) })) }));
  return { remoteRestored: true, joinCode: snapshotOwnerInviteCode(s.contest_id, s), id: s.contest_id, name: s.name, course: course(s.course), groups: rounds[0]?.groups ?? [], rounds, isTournament: rounds.length > 1, currentRound: 1, status: s.completed ? 'completed' : 'active', games: s.games, gameConfig: s.game_settings?.gameConfig, betUnit: s.game_settings?.betUnit ?? 5, hasTeams: s.game_settings?.hasTeams ?? false, createdAt: new Date().toISOString() };
}
