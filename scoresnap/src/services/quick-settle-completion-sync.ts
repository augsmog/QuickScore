import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { supabase } from '../db/supabase';
import { quickSettleCompletionOutbox, type QuickSettleCompletion } from './quick-settle-completion';

let authEpoch = 0;
const outbox = quickSettleCompletionOutbox({
  storage: AsyncStorage,
  uuid: () => Crypto.randomUUID(),
  identity: async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    const user = data.session?.user;
    if (!user || user.is_anonymous || !/^[0-9a-f-]{36}$/i.test(user.id)) return null;
    return { ownerId: user.id, epoch: authEpoch };
  },
  send: async (operation: QuickSettleCompletion) => {
    const { data, error } = await supabase.rpc('record_quick_settle_completion', {
      p_operation_id: operation.operationId,
      p_owner_id: operation.ownerId,
      p_contest_id: operation.contestId,
    });
    if (error) throw error;
    return data as { operationId: string; ownerId: string };
  },
});

// The epoch changes even if the same account signs out and back in while an RPC is in flight.
supabase.auth.onAuthStateChange(() => {
  authEpoch += 1;
  setTimeout(() => { void outbox.flush(); }, 0);
});

export const enqueueQuickSettleCompletion = (contestId: string, ownerId: string | null) => {
  if (!ownerId || !/^[0-9a-f-]{36}$/i.test(ownerId)) return Promise.resolve(false);
  // authEpoch is captured synchronously with the owner supplied by the caller.
  return outbox.enqueue(contestId, { ownerId, epoch: authEpoch });
};
export const flushQuickSettleCompletionOutbox = () => outbox.flush();
