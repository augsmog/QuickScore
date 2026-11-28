import { create } from 'zustand';
import type { ScoreFlag } from '../services/player-link';

/** Score changes waiting for a decision, per round, with this phone's ids. Memory only. */
interface FlagState { flags: Record<string, ScoreFlag[]>; setFlags: (contestId: string, flags: ScoreFlag[]) => void }
export const useFlagStore = create<FlagState>(set => ({
  flags: {},
  setFlags: (contestId, flags) => set(state => ({ flags: { ...state.flags, [contestId]: flags } })),
}));
