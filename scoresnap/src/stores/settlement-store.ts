import AsyncStorage from '@react-native-async-storage/async-storage';
import { useContestStore } from './contest-store';
import { createSettlementMarks } from './settlement-marks';

/** Device-local acknowledgements only: deliberately outside synced Contest data. */
export const settlementMarks = createSettlementMarks(AsyncStorage);
const reconcile = () => {
  if (useContestStore.persist.hasHydrated()) settlementMarks.getState().reconcile(useContestStore.getState().contests);
};
// Observe edits even when the ledger is unmounted, so edit/undo cannot revive old marks.
useContestStore.subscribe((state, previous) => {
  if (state.contests !== previous.contests) reconcile();
});
useContestStore.persist.onFinishHydration(reconcile);
settlementMarks.persist.onFinishHydration(reconcile);
reconcile();
