import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { create } from 'zustand';
import { supabase } from '../db/supabase';
import { onlineEnabled, replayOnlineScores, client } from './cross-device';
import { stageGuestHistory, claimGuestHistory } from './account-round-history';
import { useAuthStore } from '../stores/auth-store';
import { ACCOUNT_HANDOFF_KEY, GUEST_HISTORY_HANDOFF_KEY, accountHandoff } from './account-merge';

export const useHandoffStore = create<{ message: string; busy: boolean; error: boolean }>(() => ({ message: '', busy: false, error: false }));
const handoff = accountHandoff(AsyncStorage, async (name, args) => {
  if (!onlineEnabled) throw Error('Cross-device sharing is off');
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}, () => (Crypto.randomUUID() + Crypto.randomUUID()).replace(/-/g, ''));

export async function prepareAccountHandoff() {
  if (!onlineEnabled) return;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session?.user.is_anonymous) {
    if (useAuthStore.getState().isAnonymous) await stageGuestHistory();
    return;
  }
  // Drain as the guest. Conflicts/unsent writes must be handled before switching.
  await replayOnlineScores(data.session.user.id);
  const { onlineQueue } = require('./cross-device');
  const queue = await onlineQueue();
  if (queue.entries.length > 0) throw Error('Resolve or sync your queued guest scores before signing in.');
  await handoff.prepare(data.session.user.id);
  await stageGuestHistory();
}
let claiming: Promise<void> | undefined;
export function finishAccountHandoff(): Promise<void> {
  if (!onlineEnabled) return Promise.resolve();
  if (claiming) return claiming;
  claiming = (async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (!data.session || data.session.user.is_anonymous) return;
    const pending = !!(await AsyncStorage.getItem(ACCOUNT_HANDOFF_KEY) || await AsyncStorage.getItem(GUEST_HISTORY_HANDOFF_KEY));
    if (pending) useHandoffStore.setState({ busy: true, error: false });
    try {
      const result = await handoff.claim(data.session.user.id);
      const localCount = await claimGuestHistory(data.session.user.id);
      if (result || localCount) {
        useHandoffStore.setState({ message: `${result?.transferred ?? 0} guest round memberships${localCount ? ` and ${localCount} local scorecards` : ''} saved to your account. ${result?.conflicts ? `${result.conflicts} existing account memberships kept.` : 'Open this account on another device to continue.'}`, error: false });
        await client.discover();
      }
    } catch {
      useHandoffStore.setState({ message: 'Round handoff paused. Sign in to the same account and retry. Your scores remain saved.', error: true });
    } finally { useHandoffStore.setState({ busy: false }); }
  })().finally(() => { claiming = undefined; });
  return claiming;
}
