import type { Contest } from '../stores/contest-store';
import { roundPayload } from './tournament-sync-plan';
/** Explicit opt-in for new, empty rounds. Retrying keeps the same contest ID. */
export async function enrollNewRound(contest: Contest, actor: string, api: {
  create(row: Record<string, unknown>): Promise<void>;
  rpc(name: string, args: Record<string, unknown>): Promise<any>;
}): Promise<string> {
  const rounds = contest.rounds ?? [{id: contest.id, number: 1, name: contest.name, course: contest.course, groups: contest.groups}];
  if (rounds.some(r => r.groups.some(g => g.players.some(p => p.scores.some(s => s !== 0))))) throw Error('Online sharing requires an empty round. Existing scores need import review.');
  await api.create({id: contest.id, owner_id: actor, name: contest.name, course: contest.course, invite_code: contest.joinCode, protocol: 0, sync_enabled: false});
  const cap = await api.rpc('sync_capabilities', {contest_id: contest.id});
  if (cap.protocol !== 1) await api.rpc('enroll_contest', {contest_id: contest.id, expected_revision: cap.revision});
  for (const round of rounds) {
    const payload: any = roundPayload(round);
    if (payload.groups[0]?.players[0]) payload.groups[0].players[0].host = true;
    await api.rpc('sync_round_bundle', {contest_id: contest.id, payload});
  }
  await api.rpc('fetch_snapshot', {contest_id: contest.id, after_revision: 0});
  return contest.joinCode!;
}
