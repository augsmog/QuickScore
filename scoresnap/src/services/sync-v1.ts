import type { MySyncStatusV1, SyncCapabilitiesV1, SyncSnapshotV1 } from '../../../docs/xdevice/sync-contract-v1';
import type { Membership } from './online-client';
export function canSync(build: boolean, cap: SyncCapabilitiesV1 | null | undefined, contest: string): boolean {
  return !!(build && cap?.api_version === 1 && cap.contract === 'snapscore-sync-v1' && cap.protocol === 1 && cap.enabled === true && cap.channel?.private === true && cap.channel.event === 'revision' && cap.channel.topic === `snapscore:${contest}`);
}
/** Capability polling must not erase an authorized offline view on transport errors. */
export async function loadSyncCapability(build: boolean, contest: string, read: () => Promise<SyncCapabilitiesV1>, denied: () => void) {
  try {
    const cap = await read();
    if (!canSync(build, cap, contest)) throw Error('Online sharing paused. Drafts retained.');
    return cap;
  } catch (error: any) {
    if (['42501', '22023', '55000', 'PGRST301', 'PGRST302'].includes(error?.code) || [401, 403].includes(error?.status)) denied();
    throw error;
  }
}
export function isSyncDenial(error: any) {
  return ['42501', '22023', '55000', 'PGRST301', 'PGRST302'].includes(error?.code) || [401, 403].includes(error?.status);
}
export function syncV1(call: (name: string, args: Record<string, unknown>) => Promise<any>, repair: (id: string, member: Membership | null, snapshot: SyncSnapshotV1 | null) => void) {
  let generation = 0;
  const known = new Set<string>();
  const epochs = new Map<string, number>();
  let discovery = 0;
  function deny(id: string) {
    epochs.set(id, (epochs.get(id) ?? 0) + 1);
    known.add(id); // retain the invalidation marker after deleting the view
    repair(id, null, null);
  }
  async function restore(id: string, member: Membership) {
    const epoch = generation, authorization = epochs.get(id) ?? 0;
    known.add(id);
    const current = () => epoch === generation && authorization === (epochs.get(id) ?? 0);
    try {
      const cap = await call('sync_capabilities', { contest_id: id }) as SyncCapabilitiesV1;
      if (!current()) throw Error('Identity changed during restore or authorization invalidated');
      if (!canSync(true, cap, id)) throw Object.assign(Error('Online sharing paused or unsupported. Drafts retained.'), { code: '55000' });
      const snapshot = await call('fetch_snapshot', { contest_id: id, after_revision: 0 }) as SyncSnapshotV1;
      if (!current()) throw Error('Identity changed during restore or authorization invalidated');
      if (snapshot?.contest_id !== id || !Number.isInteger(snapshot.revision) || !Array.isArray(snapshot.rounds) || !canSync(true, snapshot.capabilities, id)) throw Object.assign(Error('Invalid online snapshot'), { code: '22023' });
      known.add(id);
      repair(id, member, snapshot); return snapshot;
    } catch (error: any) {
      if (current() && isSyncDenial(error)) deny(id);
      throw error;
    }
  }
  function guard(id: string) {
    known.add(id);
    const identity = generation, authorization = epochs.get(id) ?? 0;
    return () => identity === generation && authorization === (epochs.get(id) ?? 0);
  }
  return { restore, deny, guard, invalidate() { generation++; discovery++; known.clear(); epochs.clear(); }, async discover() {
    const epoch = generation, request = ++discovery, started = new Map(epochs);
    const status = await call('my_sync_status', {}) as MySyncStatusV1;
    if (epoch !== generation) throw Error('Identity changed during discovery');
    if (status?.api_version !== 1 || !Array.isArray(status.memberships) || !Array.isArray(status.requests)) throw Error('Unsupported discovery');
    const approved = new Set(status.memberships.filter(m => m.status === 'approved').map(m => m.contest_id));
    for (const id of known) if (!approved.has(id)) { deny(id); }
    for (const member of status.memberships) if (member.status !== 'approved') deny(member.contest_id);
    for (const member of status.memberships) {
      if (epoch !== generation) throw Error('Identity changed during discovery');
      if (request !== discovery) return status;
      if (member.status === 'approved' && (started.get(member.contest_id) ?? 0) === (epochs.get(member.contest_id) ?? 0)) await restore(member.contest_id, member);

    }
    return status;
  } };
}
/** Realtime adds a delivery UUID to SQL broadcast payloads. It is never score data. */
export function revisionHint(payload: any): number | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
      !Number.isSafeInteger(payload.revision) || payload.revision < 0 ||
      Object.keys(payload).some(key => key !== 'revision' && key !== 'id')) return null;
  if ('id' in payload && (typeof payload.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.id))) return null;
  return payload.revision;
}
/** No hint changes scores. Ack/reconnect always triggers an authorized full fetch. */
export function revisionChannel(transport: any, cap: SyncCapabilitiesV1, fetch: () => void, hint: (revision: number) => void) {
  let stopped = false;
  const channel = transport.channel(cap.channel.topic, { config: { private: true } })
    .on('broadcast', { event: 'revision' }, ({ payload }: { payload: any }) => {
      const revision = revisionHint(payload);
      if (!stopped && revision !== null) hint(revision);
    }).subscribe((status: string) => { if (!stopped && status === 'SUBSCRIBED') fetch(); });
  return () => { stopped = true; void transport.removeChannel(channel); };
}

export function snapshotScore(build: boolean, snapshot: SyncSnapshotV1, round: string, player: string, hole: number, strokes: number | null) {
  if (!canSync(build, snapshot.capabilities, snapshot.contest_id)) throw Error('Online sharing paused. Drafts retained.');
  const cell = snapshot.rounds.find(r => r.id === round)?.players.find(p => p.id === player)?.cells.find(c => c.hole === hole);
  if (!cell) throw Error('Refresh the online scorecard before scoring');
  return { draft: { contest_id: snapshot.contest_id, round_id: round, player_id: player, hole, action: strokes === null ? 'clear' as const : 'set' as const, strokes }, version: cell.version };
}
