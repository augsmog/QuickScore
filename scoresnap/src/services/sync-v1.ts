import type { MySyncStatusV1, SyncCapabilitiesV1, SyncSnapshotV1 } from '../../../docs/xdevice/sync-contract-v1';
import type { Membership } from './online-client';
export function canSync(build: boolean, cap: SyncCapabilitiesV1 | null | undefined, contest: string): boolean {
  return !!(build && cap?.api_version === 1 && cap.contract === 'snapscore-sync-v1' && cap.protocol === 1 && cap.enabled === true && cap.channel?.private === true && cap.channel.event === 'revision' && cap.channel.topic === `snapscore:${contest}`);
}
export function syncV1(call: (name: string, args: Record<string, unknown>) => Promise<any>, repair: (id: string, member: Membership | null, snapshot: SyncSnapshotV1 | null) => void) {
  let generation = 0;
  const known = new Set<string>();
  async function restore(id: string, member: Membership) {
    const epoch = generation;
    try {
      const cap = await call('sync_capabilities', { contest_id: id }) as SyncCapabilitiesV1;
      if (epoch !== generation) throw Error('Identity changed during restore');
      if (!canSync(true, cap, id)) throw Object.assign(Error('Online sharing paused or unsupported. Drafts retained.'), { code: '55000' });
      const snapshot = await call('fetch_snapshot', { contest_id: id, after_revision: 0 }) as SyncSnapshotV1;
      if (epoch !== generation) throw Error('Identity changed during restore');
      if (snapshot?.contest_id !== id || !Number.isInteger(snapshot.revision) || !Array.isArray(snapshot.rounds) || !canSync(true, snapshot.capabilities, id)) throw Object.assign(Error('Invalid online snapshot'), { code: '22023' });
      known.add(id);
      repair(id, member, snapshot); return snapshot;
    } catch (error: any) {
      if (epoch === generation && ['42501', '22023', '55000'].includes(error?.code)) repair(id, null, null);
      throw error;
    }
  }
  return { restore, invalidate() { generation++; known.clear(); }, async discover() {
    const epoch = generation;
    const status = await call('my_sync_status', {}) as MySyncStatusV1;
    if (epoch !== generation) throw Error('Identity changed during discovery');
    if (status?.api_version !== 1 || !Array.isArray(status.memberships) || !Array.isArray(status.requests)) throw Error('Unsupported discovery');
    const approved = new Set(status.memberships.filter(m => m.status === 'approved').map(m => m.contest_id));
    for (const id of known) if (!approved.has(id)) { repair(id, null, null); known.delete(id); }
    for (const member of status.memberships) if (member.status !== 'approved') repair(member.contest_id, null, null);
    for (const member of status.memberships) {
      if (epoch !== generation) throw Error('Identity changed during discovery');
      if (member.status === 'approved') await restore(member.contest_id, member);

    }
    return status;
  } };
}
/** No hint changes scores. Ack/reconnect always triggers an authorized full fetch. */
export function revisionChannel(transport: any, cap: SyncCapabilitiesV1, fetch: () => void, hint: (revision: number) => void) {
  let stopped = false;
  const channel = transport.channel(cap.channel.topic, { config: { private: true } })
    .on('broadcast', { event: 'revision' }, ({ payload }: { payload: any }) => {
      if (!stopped && payload && Object.keys(payload).length === 1 && Number.isInteger(payload.revision) && payload.revision >= 0) hint(payload.revision);
    }).subscribe((status: string) => { if (!stopped && status === 'SUBSCRIBED') fetch(); });
  return () => { stopped = true; void transport.removeChannel(channel); };
}

export function snapshotScore(build: boolean, snapshot: SyncSnapshotV1, round: string, player: string, hole: number, strokes: number | null) {
  if (!canSync(build, snapshot.capabilities, snapshot.contest_id)) throw Error('Online sharing paused. Drafts retained.');
  const cell = snapshot.rounds.find(r => r.id === round)?.players.find(p => p.id === player)?.cells.find(c => c.hole === hole);
  if (!cell) throw Error('Refresh the online scorecard before scoring');
  return { draft: { contest_id: snapshot.contest_id, round_id: round, player_id: player, hole, action: strokes === null ? 'clear' as const : 'set' as const, strokes }, version: cell.version };
}
