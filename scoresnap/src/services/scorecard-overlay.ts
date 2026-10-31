import type { Contest, ContestGroup } from '../stores/contest-store';
import type { SyncSnapshotV1 } from '../../../docs/xdevice/sync-contract-v1';

/** Render-only: authorized cells never mutate local scores or enqueue writes. */
export function overlayScorecard(contest: Contest, snapshot?: SyncSnapshotV1): Contest {
  if (!snapshot || snapshot.contest_id !== contest.id || snapshot.protocol !== 1) return contest;
  const mapped = (kind: 'round' | 'player', id: string) => snapshot.id_map.find(m => m.kind === kind && m.local_id === id)?.server_id ?? id;
  const groups = (local: ContestGroup[], localRound: string) => {
    const remote = snapshot.rounds.find(r => r.id === mapped('round', localRound));
    if (!remote) return local;
    return local.map(g => ({ ...g, players: g.players.map(p => {
      const player = remote.players.find(r => r.id === mapped('player', p.id));
      if (!player) return p;
      const scores = [...p.scores];
      for (const cell of player.cells) {
        const edit = contest.onlineEdits?.[JSON.stringify([localRound, p.id, cell.hole])];
        if (edit) { scores[cell.hole - 1] = edit.strokes; continue; }
        scores[cell.hole - 1] = cell.strokes ?? 0;
      }
      return { ...p, scores };
    }) }));
  };
  return { ...contest, groups: groups(contest.groups, contest.id),
    rounds: contest.rounds?.map(r => ({ ...r, groups: groups(r.groups, r.id) })) };
}
