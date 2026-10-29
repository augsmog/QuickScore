import { validJoinCode, normalizeJoinCode } from './guest-join';
export interface OnlineRpc { (name: string, args: Record<string, unknown>): Promise<{ data: any; error: any }> }
export interface Membership { role: 'host' | 'player' | 'scorer' | 'viewer'; status: string; player_id: string | null }
export interface OnlineSnapshot { revision: number; rounds: { id: string; number: number; name: string; groups: { id: string; name: string; players: { id: string; name: string; scores: (number | null)[] }[] }[] }[] }
export function onlineClient(rpc: OnlineRpc, repair: (contest: string, membership: Membership | null, snapshot: OnlineSnapshot | null) => void) {
  let generation = 0;
  async function call(name: string, args: Record<string, unknown>) {
    const { data, error } = await rpc(name, args); if (error) throw error; return data;
  }
  return {
    invalidate() { generation++; },
    async requestJoin(code: string, name: string) {
      if (!validJoinCode(code) || !name.trim() || name.trim().length > 80) throw Error('Enter a valid code and display name');
      await call('request_join', { code: normalizeJoinCode(code), display_name: name.trim() });
      return { status: 'pending' as const }; // never expose a roster from code lookup
    },
    listRequests: (contest: string) => call('list_join_requests', { contest_id: contest }),
    async rejoinHost(contest: string) {
      const epoch = generation;
      try {
        // M2 permits owner-hosts without an explicit membership row. The host-only
        // request RPC proves that role; a profile/provider cache never does.
        const requests = await call('list_join_requests', { contest_id: contest });
        const snapshot = await call('tournament_snapshot', { contest_id: contest }) as OnlineSnapshot;
        if (!Number.isInteger(snapshot?.revision) || !Array.isArray(snapshot.rounds)) throw Error('Invalid online snapshot');
        if (epoch !== generation) throw Error('Identity changed during restore');
        repair(contest, { role: 'host', status: 'approved', player_id: null }, snapshot);
        return { requests, snapshot };
      } catch (error) { if (epoch === generation) repair(contest, null, null); throw error; }
    },
    decide: (request: string, approve: boolean, player: string | null) => call('decide_join_request', { request_id: request, approve, player_id: player }),
    async rejoin(contest: string) {
      const epoch = generation;
      try {
        const membership = await call('my_membership', { contest_id: contest }) as Membership | null;
        if (!membership || membership.status !== 'approved') { if (epoch === generation) repair(contest, null, null); return null; }
        const snapshot = await call('tournament_snapshot', { contest_id: contest }) as OnlineSnapshot;
        if (!Number.isInteger(snapshot?.revision) || !Array.isArray(snapshot.rounds)) throw Error('Invalid online snapshot');
        if (epoch !== generation) throw Error('Identity changed during restore');
        repair(contest, membership, snapshot); return snapshot;
      } catch (error) { if (epoch === generation) repair(contest, null, null); throw error; }
    },
  };
}
/** Hints contain a revision only; snapshots always pass through authorized RPCs.
 * Subscribe transport is injected until M4b supplies its private-channel contract.
 */
export function foregroundSync(fetch: () => Promise<OnlineSnapshot | null>, report: (error: unknown) => void, interval = 30000) {
  let stopped = false, busy = false, again = false, revision = -1;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let attempts = 0;
  async function refresh() {
    if (stopped) return;
    if (retry) { clearTimeout(retry); retry = undefined; }
    if (busy) { again = true; return; }
    busy = true;
    try { const result = await fetch(); if (result) revision = result.revision; attempts = 0; }
    catch (error: any) {
      report(error);
      if (!stopped && !['42501', '22023', '55000'].includes(error?.code)) {
        const delay = Math.min(30000, 1000 * 2 ** Math.min(attempts++, 5)) * (0.75 + Math.random() * 0.25);
        retry = setTimeout(() => void refresh(), delay);
      }
    }
    finally { busy = false; if (again) { again = false; void refresh(); } }
  }
  const timer = setInterval(() => void refresh(), interval);
  void refresh();
  return { hint(value: unknown) { if (typeof value === 'number' && Number.isInteger(value) && value > revision) void refresh(); }, stop() { stopped = true; clearInterval(timer); if (retry) clearTimeout(retry); } };
}
