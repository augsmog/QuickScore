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
    if (result.error) throw result.error;
    if (!result.data.session) throw Error('Guest session unavailable');
    return result.data.session.user.id;
  })().finally(() => { signingIn = undefined; });
  return signingIn;
}
const boxes = new Map<string, ReturnType<typeof scoreOutbox>>();
async function box() {
  const actor = await remoteIdentity();
  if (!boxes.has(actor)) boxes.set(actor, scoreOutbox(outboxStorage, actor, Crypto.randomUUID, async args => {
    // Refresh before replay; never replay an old identity's operations as another user.
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (data.session?.user.id !== actor) throw Object.assign(Error('Identity changed'), { code: '42501' });
    const result = await supabase.rpc('write_score', args);
    if (result.error) throw result.error;
    return result.data as Receipt;
  }));
  return boxes.get(actor)!;
}
// Web Locks excludes other tabs for the entire read/modify/write sequence.
async function writer<T>(work: () => Promise<T>): Promise<T> {
  if (Platform.OS !== 'web') return work();
  const locks = (globalThis.navigator as any)?.locks;
  if (!locks) throw Error('This browser cannot safely queue online scores; use one supported browser');
  return locks.request('snapscore-online-outbox', { ifAvailable: true }, (lock: unknown) => {
    if (!lock) throw Error('Online scoring is active in another tab');
    return work();
  });
}
export async function queueOnlineScore(draft: ScoreDraft, expectedVersion: number) {
  return writer(async () => (await box()).enqueue(draft, expectedVersion));
}
export async function replayOnlineScores() {
  if (!onlineEnabled) return;
  // No anonymous signup just because a timer fires.
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session) return;
  return writer(async () => (await box()).replay());
}
export async function onlineQueue() { return writer(async () => (await box()).inspect()); }
export async function resolveOnlineConflict(id: string, choice: 'keep-current' | 'use-mine') {
  return writer(async () => (await box()).resolve(id, choice, true));
}
