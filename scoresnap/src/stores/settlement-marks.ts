import { createStore } from 'zustand/vanilla';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Contest } from './contest-store';
import type { Transaction } from '../engine/types';
import { createGatedStorage, SETTLEMENT_STORAGE_KEY, type KeyValueStorage, persistGate } from './persisted-keys';

/** Canonical, collision-free revision; never includes selected tab/round or sharing metadata. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map(key => [key, v[key]])) : v);
}
export function settlementRevision(contest: Contest): string {
  const tournament = contest.gameConfig?.rulesVersion === 1 && contest.isTournament && contest.rounds?.length;
  return canonical({ course: contest.course, games: contest.games, betUnit: contest.betUnit,
    gameConfig: contest.gameConfig, auxiliaryData: contest.auxiliaryData,
    auxiliaryByScope: contest.auxiliaryByScope,
    groups: tournament ? undefined : contest.groups,
    rounds: tournament ? contest.rounds!.map(r => ({ id: r.id, course: r.course, groups: r.groups })) : undefined });
}
export const settlementScope = (accountId: string | null, contestId: string) => JSON.stringify([accountId, contestId]);
/** The engine has no source IDs. Equal rows get distinct ordinals within an unchanged revision.
 * Any calculation-input change invalidates all marks, including ambiguous duplicate rows.
 */
export function settlementTransactionKeys(transactions: Transaction[]): string[] {
  const seen = new Map<string, number>();
  return transactions.map(t => {
    const tuple = JSON.stringify([t.from, t.to, t.gameType, t.amount]);
    const occurrence = seen.get(tuple) ?? 0;
    seen.set(tuple, occurrence + 1);
    return JSON.stringify([tuple, occurrence]);
  });
}
type Ledger = { contestId: string; revision: string; marks: Record<string, string> };
type MarksState = {
  ready: boolean;
  ledgers: Record<string, Ledger>;
  toggle: (scope: string, contestId: string, revision: string, key: string) => void;
  reconcile: (contests: Contest[]) => void;
  reset: () => void;
};
export function createSettlementMarks(storage: KeyValueStorage, now = () => new Date().toISOString()) {
  let persistPruned = () => {};
  let prunedOnHydration = false;
  let observedBeforeHydration: Map<string, string> | undefined;
  let generation = 0;
  let hydrationGeneration = 0;
  let writes = Promise.resolve();
  const gated = createGatedStorage(storage);
  const orderedStorage: KeyValueStorage = {
    getItem: key => storage.getItem(key),
    setItem: (key, value) => {
      // Capture the gate before queueing as well as when the write runs.
      if (persistGate.suppressed) return Promise.resolve();
      writes = writes.catch(() => {}).then(() => gated.setItem(key, value));
      return writes.catch(() => { console.warn("Settlement marks could not be saved on this device."); });
    },
    removeItem: key => { writes = writes.catch(() => {}).then(() => storage.removeItem(key)); return writes; },
  };
  let finishHydration = () => {};
  const store = createStore<MarksState>()<[['zustand/persist', { ledgers: Record<string, Ledger> }]]>((setState, getState, api) => {
    finishHydration = () => setState({ ready: true });
    return persist<MarksState, [], [], { ledgers: Record<string, Ledger> }>((set, get) => {
      persistPruned = () => set({ ledgers: get().ledgers });
      return {
        ready: false,
        ledgers: {},
        toggle: (scope, contestId, revision, key) => {
          if (!get().ready || persistGate.suppressed) return; // Late hydration must not overwrite a tap.
          const previous = get().ledgers[scope];
          const marks = previous?.revision === revision ? { ...previous.marks } : {};
          if (marks[key]) delete marks[key]; else marks[key] = now();
          set({ ledgers: { ...get().ledgers, [scope]: { contestId, revision, marks } } });
        },
        reconcile: contests => {
          if (!get().ready) {
            const revisions = new Map(contests.map(c => [c.id, settlementRevision(c)]));
            // Remember every observed edit, including A -> B -> A before the read resolves.
            observedBeforeHydration = observedBeforeHydration === undefined ? revisions
              : new Map([...observedBeforeHydration].filter(([id, revision]) => revisions.get(id) === revision));
            return;
          }
          const byId = new Map(contests.map(c => [c.id, c]));
          const ledgers = { ...get().ledgers };
          let changed = false;
          for (const [scope, ledger] of Object.entries(ledgers)) {
            const contest = byId.get(ledger.contestId);
            if (!contest || settlementRevision(contest) !== ledger.revision) {
              delete ledgers[scope]; changed = true;
            }
          }
          if (changed) set({ ledgers });
        },
        reset: () => { generation++; set({ ledgers: {} }); },
      };
    }, {
      name: SETTLEMENT_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => orderedStorage),
      partialize: state => ({ ledgers: state.ledgers }),
      // Treat malformed/old local data as empty, never as a settlement acknowledgement.
      merge: (persisted, current) => {
        if (hydrationGeneration !== generation) return current;
        const ledgers: Record<string, Ledger> = {};
        const input = (persisted as { ledgers?: unknown })?.ledgers;
        if (input && typeof input === 'object') for (const [scope, value] of Object.entries(input)) {
          const ledger = value as Ledger;
          if (!ledger || typeof ledger.contestId !== 'string' || typeof ledger.revision !== 'string' || !ledger.marks || typeof ledger.marks !== 'object') continue;
          if (observedBeforeHydration && observedBeforeHydration.get(ledger.contestId) !== ledger.revision) { prunedOnHydration = true; continue; }
          const marks = Object.fromEntries(Object.entries(ledger.marks).filter(([, timestamp]) => typeof timestamp === 'string' && Number.isFinite(Date.parse(timestamp))));
          ledgers[scope] = { contestId: ledger.contestId, revision: ledger.revision, marks };
        }
        return { ...current, ledgers };
      },
      onRehydrateStorage: () => {
        hydrationGeneration = generation;
        prunedOnHydration = false;
        return () => {
          finishHydration();
          if (prunedOnHydration && hydrationGeneration === generation) persistPruned();
          observedBeforeHydration = undefined;
        };
      },
    })(setState, getState, api);
  });
  return Object.assign(store, { flush: () => writes.catch(() => {}) });
}
