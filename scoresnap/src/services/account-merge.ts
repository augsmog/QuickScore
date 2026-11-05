export interface MergeStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
export const ACCOUNT_HANDOFF_KEY = 'snapscore.account-handoff.v1';
export interface Handoff { guest: string; token: string; target?: string }
export interface MergeResult { transferred: number; conflicts: number }
/** Persist the capability before issuing its RPC so interrupted requests can retry.
 * A target is pinned before claiming; another account must never consume a retry.
 */
export function accountHandoff(storage: MergeStorage, rpc: (name: string, args: Record<string, unknown>) => Promise<any>, token: () => string) {
  return {
    async prepare(guest: string) {
      const raw = await storage.getItem(ACCOUNT_HANDOFF_KEY);
      const old: Handoff | null = raw ? JSON.parse(raw) : null;
      if (old && (old.guest !== guest || old.target)) throw Error('Finish the pending account handoff first.');
      const handoff = old ?? { guest, token: token() };
      await storage.setItem(ACCOUNT_HANDOFF_KEY, JSON.stringify(handoff));
      await rpc('prepare_account_handoff', { p_token: handoff.token });
    },
    async claim(target: string): Promise<MergeResult | null> {
      const raw = await storage.getItem(ACCOUNT_HANDOFF_KEY);
      if (!raw) return null;
      const handoff: Handoff = JSON.parse(raw);
      if (handoff.target && handoff.target !== target) throw Error('Sign in to the account that started this handoff.');
      if (handoff.guest === target) return null;
      await storage.setItem(ACCOUNT_HANDOFF_KEY, JSON.stringify({ ...handoff, target }));
      const result = await rpc('claim_account_handoff', { p_token: handoff.token, p_target: target });
      await storage.removeItem(ACCOUNT_HANDOFF_KEY);
      return result;
    },
  };
}

/** Account's complete scorecard wins duplicate IDs. Combining score arrays could
 * silently invent a scorecard; never dedupe by name, date or course. */
export function mergeRoundHistory<T extends { id: string }>(account: T[], guest: T[]): T[] {
  const result = new Map<string, T>();
  for (const round of [...account, ...guest]) if (!result.has(round.id)) result.set(round.id, round);
  return [...result.values()];
}
export const GUEST_HISTORY_HANDOFF_KEY = 'snapscore.guest-history-handoff.v1';
