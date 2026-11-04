import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../db/supabase';
import { useContestStore, type Contest } from '../stores/contest-store';
import { GUEST_HISTORY_HANDOFF_KEY, mergeRoundHistory } from './account-merge';

/** Capture before replacing the guest session. Snapshots grant no live access. */
async function hydrateHistory() {
  if (useContestStore.persist && !useContestStore.persist.hasHydrated()) await useContestStore.persist.rehydrate();
}
export async function stageGuestHistory() {
  await hydrateHistory();
  const previous = await AsyncStorage.getItem(GUEST_HISTORY_HANDOFF_KEY);
  if (previous && JSON.parse(previous).target) throw Error('Finish the pending account history handoff first.');
  const contests = useContestStore.getState().contests.filter(c => !c.remoteRestored);
  await AsyncStorage.setItem(GUEST_HISTORY_HANDOFF_KEY, JSON.stringify({ contests }));
}
export async function claimGuestHistory(target: string) {
  await hydrateHistory();
  const raw = await AsyncStorage.getItem(GUEST_HISTORY_HANDOFF_KEY);
  const staged: { contests: Contest[]; target?: string } | null = raw ? JSON.parse(raw) : null;
  if (staged?.target && staged.target !== target) throw Error('Account history handoff belongs to another account.');
  if (staged) {
    await AsyncStorage.setItem(GUEST_HISTORY_HANDOFF_KEY, JSON.stringify({ ...staged, target }));
    if (staged.contests.length) {
      const { error } = await supabase.from('account_round_history').upsert(staged.contests.map(c => ({ user_id: target, local_id: c.id, snapshot: c })), { onConflict: 'user_id,local_id', ignoreDuplicates: true });
      if (error) throw error;
    }
  }
  const { data, error } = await supabase.from('account_round_history').select('snapshot').eq('user_id', target);
  if (error) throw error;
  const session = await supabase.auth.getSession();
  if (session.error || session.data.session?.user.id !== target) throw Error('Identity changed during history handoff.');
  const history = (data ?? []).map(row => row.snapshot as Contest);
  // On claim the account wins. On reload retain newer device edits over archive.
  useContestStore.setState(state => ({ contests: staged ? mergeRoundHistory(history, state.contests) : mergeRoundHistory(state.contests, history) }));
  if (staged) await AsyncStorage.removeItem(GUEST_HISTORY_HANDOFF_KEY);
  return staged?.contests.length ?? 0;
}
