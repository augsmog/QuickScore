import type { ContestGroupStatus } from './contest-group-status';
import type { StartType } from './group-status';

export type TeeSheetRow = ContestGroupStatus & { startKey: string | null };

function minutes(time?: string): number | null {
  const match = time?.match(/^(1[0-2]|[1-9]):([0-5][0-9]) (AM|PM)$/);
  return match ? (Number(match[1]) % 12 + (match[3] === 'PM' ? 12 : 0)) * 60 + Number(match[2]) : null;
}

/** Build stable tee-sheet rows without changing the caller's field or progress. */
export function buildTeeSheet(statuses: ContestGroupStatus[], startType?: StartType): TeeSheetRow[] {
  const rows = statuses.map(status => ({ ...status, startKey: startType === 'shotgun'
    ? `${status.startSlot.hole}${status.startSlot.wave ?? ''}` : status.teeTime ?? null }));
  if (startType === 'shotgun') {
    const wave = { A: 0, B: 1 };
    rows.sort((a, b) => a.startSlot.hole - b.startSlot.hole
      || (a.startSlot.wave === undefined ? 2 : wave[a.startSlot.wave])
        - (b.startSlot.wave === undefined ? 2 : wave[b.startSlot.wave]));
  } else if (rows.every(row => minutes(row.teeTime) !== null)) {
    rows.sort((a, b) => minutes(a.teeTime)! - minutes(b.teeTime)!);
  }
  return rows;
}
