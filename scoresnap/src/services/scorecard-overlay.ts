import type { Course } from '../engine/types';
import type { Contest, ContestGroup } from '../stores/contest-store';
import type { SyncSnapshotV1 } from '../../../docs/xdevice/sync-contract-v1';

/** Render-only: authorized cells never mutate local scores or enqueue writes. */
export function overlayScorecard(contest: Contest, snapshot?: SyncSnapshotV1): Contest {
  if (!snapshot || snapshot.contest_id !== contest.id || snapshot.protocol !== 1) return contest;
  const mapped = (kind: 'round' | 'player', id: string) => snapshot.id_map.find(m => m.kind === kind && m.local_id === id)?.server_id ?? id;
  const groups = (local: ContestGroup[], localRound: string, course: Course) => {
    const remote = snapshot.rounds.find(r => r.id === mapped('round', localRound)) ?? (contest.remoteRestored && localRound === contest.id ? snapshot.rounds[0] : undefined);
    if (!remote) return local;
    return local.map(g => ({ ...g, players: g.players.map(p => {
      const player = remote.players.find(r => r.id === mapped('player', p.id));
      if (!player) return p;
      const scores = [...p.scores];
      for (const cell of player.cells) {
        const index = course.holes.findIndex(h => h.num === cell.hole);
        if (index < 0) continue;
        const edit = contest.onlineEdits?.[JSON.stringify([localRound, p.id, cell.hole])];
        if (edit) { scores[index] = edit.strokes; continue; }
        scores[index] = cell.strokes ?? 0;
      }
      return { ...p, scores };
    }) }));
  };
  return { ...contest, groups: groups(contest.groups, contest.id, contest.course),
    rounds: contest.rounds?.map(r => ({ ...r, groups: groups(r.groups, r.id, r.course ?? contest.course) })) };
}
