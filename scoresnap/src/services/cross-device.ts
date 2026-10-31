import { persistGate } from '../stores/persisted-keys';
import { tournamentCompletion } from './tournament-completion';
import { loadSyncCapability, revisionChannel, snapshotScore } from './sync-v1';
import { foregroundSync, foregroundRetry } from './online-client';
import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import { supabase } from '../db/supabase';
import { outboxStorage } from '../db/outbox-storage';
import { CROSS_DEVICE_SHARING_ENABLED } from '../config/features';
import { REAL_AUTH_CONFIGURED } from '../config/auth';
import { anonymousSignInOptions } from './captcha';
import { scoreOutbox, type ScoreDraft, type Receipt } from './score-outbox';
import { onlineClient } from './online-client';
import { useOnlineStore } from '../stores/online-store';

export const onlineEnabled = CROSS_DEVICE_SHARING_ENABLED && REAL_AUTH_CONFIGURED;
export const client = onlineClient(async (name, args) => {
  if (!onlineEnabled) throw Error('Cross-device sharing is off');
  return supabase.rpc(name, args);
}, (id, membership, snapshot) => useOnlineStore.getState().repair(id, membership, snapshot));
let signingIn: Promise<string> | undefined;
export async function remoteIdentity() {
  if (!onlineEnabled) throw Error('Cross-device sharing is off');
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (data.session) return data.session.user.id;
  if (!signingIn) signingIn = (async () => {
    const result = await supabase.auth.signInAnonymously(await anonymousSignInOptions());
    if (result.error) throw Error('Guest sign-in unavailable. Sign in with email or Apple, then reopen your invite.');
    if (!result.data.session) throw Error('Guest session unavailable');
    return result.data.session.user.id;
  })().finally(() => { signingIn = undefined; });
  return signingIn;
}
let generation = 0;
const active = new Set<Promise<unknown>>();
export async function resetOnlineQueues() {
  generation += 1;
  await Promise.allSettled([...active]);
  boxes.clear();
  await outboxStorage.clear();
}
const boxes = new Map<string, ReturnType<typeof scoreOutbox>>();
async function box(expectedActor?: string) {
  const actor = await remoteIdentity();
  if (expectedActor && actor !== expectedActor) throw Error('Identity changed during replay');
  if (!boxes.has(actor)) boxes.set(actor, scoreOutbox({
    getItem: key => outboxStorage.getItem(key),
    setItem: (key, value) => persistGate.suppressed ? Promise.resolve() : outboxStorage.setItem(key, value),
  }, actor, Crypto.randomUUID, async args => {
    if (persistGate.suppressed) throw Object.assign(Error('Account reset'), { code: '42501' });
    // Refresh before replay; never replay an old identity's operations as another user.
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (data.session?.user.id !== actor) throw Object.assign(Error('Identity changed'), { code: '42501' });
    await requireSyncCapability(args.contest_id);
    const current = await supabase.auth.getSession();
    if (current.error) throw current.error;
    if (current.data.session?.user.id !== actor) throw Object.assign(Error('Identity changed'), { code: '42501' });
    if (persistGate.suppressed) throw Object.assign(Error('Account reset'), { code: '42501' });
    const result = await supabase.rpc('write_score', args);
    if (result.error) throw result.error;
    return result.data as Receipt;
  }, (entries, retained) => {
    if (!entries.some(e => e.localEdit) && !retained?.localEdit) return;
    const store = require('../stores/contest-store');
    for (const entry of entries) if (entry.localEdit) store.settleOnlineEdit(entry.draft.contest_id, entry.localEdit);
    if (retained?.localEdit) {
      const d = retained.draft;
      const snapshot = useOnlineStore.getState().events[d.contest_id]?.snapshot;
      const local = (kind: string, id: string | null) => snapshot?.id_map.find(m => m.kind === kind && m.server_id === id)?.local_id ?? id;
      store.retainOnlineEdit(d.contest_id, retained.localCell ?? JSON.stringify([local('round', d.round_id), local('player', d.player_id), d.hole]), retained.localEdit, d.strokes ?? 0);
    }
  }));
  return boxes.get(actor)!;
}
// Web Locks excludes other tabs for the entire read/modify/write sequence.
let nativeWriter: Promise<unknown> = Promise.resolve();
function writer<T>(work: () => Promise<T>): Promise<T> {
  const epoch = generation;
  const guarded = async () => {
    if (persistGate.suppressed || epoch !== generation) throw Error('Account reset');
    return work();
  };
  const pending = runWriter(guarded);
  active.add(pending);
  return pending.finally(() => active.delete(pending));
}
async function runWriter<T>(work: () => Promise<T>): Promise<T> {
  const result = nativeWriter.then(() => {
    if (Platform.OS !== 'web') return work();
    const locks = (globalThis.navigator as any)?.locks;
    if (!locks) throw Error('This browser cannot safely queue online scores; use one supported browser');
    return locks.request('snapscore-online-outbox', work);
  });
  nativeWriter = result.catch(() => undefined);
  return result;
}
export async function queueOnlineScore(draft: ScoreDraft, expectedVersion: number, localEdit?: string, localCell?: string) {
  return writer(async () => (await box()).enqueue(draft, expectedVersion, localEdit, localCell));
}
export async function replayOnlineScores(expectedActor?: string) {
  if (!onlineEnabled) return;
  // No anonymous signup just because a timer fires.
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session) return;
  if (expectedActor && data.session.user.id !== expectedActor) throw Error('Identity changed during replay');
  return writer(async () => (await box(data.session.user.id)).replay());
}
export async function onlineQueue() { return writer(async () => (await box()).inspect()); }
export async function resolveOnlineConflict(id: string, choice: 'keep-current' | 'use-mine') {
  return writer(async () => (await box()).resolve(id, choice, true));
}

export async function requireSyncCapability(contest: string) {
  if (!onlineEnabled) throw Error('Cross-device sharing is off');
  return loadSyncCapability(onlineEnabled, contest, async () => {
    const { data, error } = await supabase.rpc('sync_capabilities', { contest_id: contest });
    if (error) throw error;
    return data;
  }, () => client.deny(contest));
}
export function watchOnline(contest: string, refresh: () => Promise<any>, report: (error: unknown) => void) {
  if (!onlineEnabled) return () => {};
  let stopped = false;
  let remove: (() => void) | undefined;
  const poll = foregroundSync(refresh, report);
  void (async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (!data.session) throw Error('Session unavailable');
    await supabase.realtime.setAuth(data.session.access_token);
    return requireSyncCapability(contest);
  })().then(cap => {
    if (!stopped) remove = revisionChannel(supabase, cap, () => { void refresh().catch(report); }, poll.hint);
  }).catch(report);
  return () => { stopped = true; poll.stop(); remove?.(); };
}
export async function queueSnapshotScore(contest: string, round: string, player: string, hole: number, strokes: number | null, localEdit?: string) {
  const event = useOnlineStore.getState().events[contest];
  if (!event) throw Error('Refresh the online scorecard before scoring');
  const { draft, version } = snapshotScore(onlineEnabled, event.snapshot, round, player, hole, strokes);
  const local = (kind: string, id: string) => event.snapshot.id_map.find(m => m.kind === kind && m.server_id === id)?.local_id ?? id;
  const localCell = localEdit ? JSON.stringify([local('round', round), local('player', player), hole]) : undefined;
  await queueOnlineScore(draft, version, localEdit, localCell);
  await replayOnlineScores();
}

export const refreshOnline = foregroundRetry(async () => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.user.id ?? null;
}, replayOnlineScores, async () => { await client.discover(); return null; });

/** No anonymous signup from completion controls; refresh current authorization. */
const completion = tournamentCompletion({
  rpc: async (name, args) => {
    if (!onlineEnabled) throw Error('Cross-device sharing is off');
    return supabase.rpc(name, args);
  },
  actor: async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session?.user.id ?? null;
  },
  queue: async () => (await box()).inspect(),
  refresh: async id => {
    const event = useOnlineStore.getState().events[id];
    if (event?.membership.role === 'host') return (await client.rejoinHost(id)).snapshot;
    return client.rejoin(id);
  },
});

export const tournament = {
  submit: (id: string, round: string, group: string) => writer(() => completion.submit(id, round, group)),
  finalize: (id: string) => writer(() => completion.finalize(id)),
};
