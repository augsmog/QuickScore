import { create } from 'zustand';
import type { Membership, OnlineSnapshot } from '../services/online-client';
interface RemoteEvent { membership: Membership; snapshot: OnlineSnapshot }
interface OnlineState {
  events: Record<string, RemoteEvent>;
  error: string | null;
  repair: (contest: string, membership: Membership | null, snapshot: OnlineSnapshot | null) => void;
  reset: () => void;
}
// Authorized remote data is memory-only and is cleared on identity change/denial.
export const useOnlineStore = create<OnlineState>((set) => ({
  events: {}, error: null,
  repair: (contest, membership, snapshot) => set(state => {
    if (membership && snapshot && state.events[contest]?.snapshot.revision > snapshot.revision) return {};
    const events = { ...state.events };
    if (membership && snapshot) events[contest] = { membership, snapshot };
    else delete events[contest];
    return { events };
  }),
  reset: () => set({ events: {}, error: null }),
}));
