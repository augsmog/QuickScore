import type { SyncSnapshotV1 } from '../../../docs/xdevice/sync-contract-v1';
import { syncV1, isSyncDenial } from './sync-v1';
import { validJoinCode, normalizeJoinCode } from './guest-join';
export interface OnlineRpc { (name: string, args: Record<string, unknown>): Promise<{ data: any; error: any }> }
export interface Membership { role: 'host' | 'player' | 'scorer' | 'viewer'; status: string; player_id: string | null }
export type OnlineSnapshot = SyncSnapshotV1;
export function onlineClient(rpc: OnlineRpc, repair: (contest: string, membership: Membership | null, snapshot: OnlineSnapshot | null) => void) {
  let generation = 0;
  async function call(name: string, args: Record<string, unknown>) {
    const { data, error } = await rpc(name, args); if (error) throw error; return data;
  }
  const v1 = syncV1(call, repair);
  return {
    discover: v1.discover,
    restore: v1.restore,
    deny: v1.deny,
    invalidate() { generation++; v1.invalidate(); },
    async requestJoin(code: string, name: string) {
      if (!validJoinCode(code) || !name.trim() || name.trim().length > 80) throw Error('Enter a valid code and display name');
      await call('request_join', { code: normalizeJoinCode(code), display_name: name.trim() });
      return { status: 'pending' as const }; // never expose a roster from code lookup
    },
    listRequests: (contest: string) => call('list_join_requests', { contest_id: contest }),
    async rejoinHost(contest: string) {
      const epoch = generation, authorized = v1.guard(contest);
      try {
        // M2 permits owner-hosts without an explicit membership row. The host-only
        // request RPC proves that role; a profile/provider cache never does.
        const requests = await call('list_join_requests', { contest_id: contest });
        if (!authorized()) throw Error('Authorization changed during restore');
        const snapshot = await v1.restore(contest, { role: 'host', status: 'approved', player_id: null });
        if (!Number.isInteger(snapshot?.revision) || !Array.isArray(snapshot.rounds)) throw Error('Invalid online snapshot');
        if (epoch !== generation) throw Error('Identity changed during restore');

        return { requests, snapshot };
      } catch (error) { if (epoch === generation && isSyncDenial(error)) v1.deny(contest); throw error; }
    },
    decide: (request: string, approve: boolean, player: string | null) => call('decide_join_request', { request_id: request, approve, player_id: player }),
    async rejoin(contest: string) {
      const epoch = generation, authorized = v1.guard(contest);
      try {
        const membership = await call('my_membership', { contest_id: contest }) as Membership | null;
        if (!membership || membership.status !== 'approved') { if (epoch === generation) v1.deny(contest); return null; }
        if (!authorized()) throw Error('Authorization changed during restore');
        const snapshot = await v1.restore(contest, membership);
        if (!Number.isInteger(snapshot?.revision) || !Array.isArray(snapshot.rounds)) throw Error('Invalid online snapshot');
        if (epoch !== generation) throw Error('Identity changed during restore');
        return snapshot;
      } catch (error) { if (epoch === generation && isSyncDenial(error)) v1.deny(contest); throw error; }
    },
  };
}
/** Hints contain a revision only; snapshots always pass through authorized RPCs.
 * Private v1 subscriptions feed this handler; polling remains the fallback.
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

/** One foreground/reconnect drain per actor, shared by discovery and scorecard watchers. */
export function foregroundRetry<T>(identity: () => Promise<string | null>, replay: (actor: string) => Promise<unknown>, discover: () => Promise<T>) {
  const active = new Map<string, Promise<T>>();
  return async () => {
    const actor = await identity();
    if (!actor) return null;
    const existing = active.get(actor);
    if (existing) return existing;
    const work = (async () => {
      await replay(actor);
      if (await identity() !== actor) throw Error('Identity changed during reconnect');
      return discover();
    })();
    active.set(actor, work);
    try { return await work; } finally { if (active.get(actor) === work) active.delete(actor); }
  };
}

/** A host transport outage must not fall back to membership-only discovery. */
export async function hostOrDiscover<T>(api: { rejoinHost(contest: string): Promise<T>; discover(): Promise<unknown> }, contest: string): Promise<T | null> {
  try { return await api.rejoinHost(contest); }
  catch (error) {
    if (!isSyncDenial(error)) throw error;
    await api.discover();
    return null;
  }
}
