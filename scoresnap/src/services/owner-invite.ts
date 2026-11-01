import type { SyncSnapshotV1 } from '../../../docs/xdevice/sync-contract-v1';
import type { Membership } from './online-client';
import { validJoinCode, normalizeJoinCode } from './guest-join';
import { canSync } from './sync-v1';

// Reuse the existing recovery message; a missing server field is not a local invite.
export const OWNER_INVITE_UNAVAILABLE = 'Could not check online sharing. Open Online sync to retry.';

/** SQL normalizes join input, not the stored code. Never repair a malformed server value locally. */
export function snapshotOwnerInviteCode(contest: string, snapshot: SyncSnapshotV1 | null | undefined): string | undefined {
  if (snapshot?.contest_id !== contest || snapshot.protocol !== 1 || snapshot.completed ||
      !canSync(true, snapshot.capabilities, contest)) return undefined;
  const code = snapshot.invite_code;
  return typeof code === 'string' && code === normalizeJoinCode(code) && validJoinCode(code) ? code : undefined;
}

/** Persisted joinCode, local ownership flags and member snapshots are never owner proof. */
export function ownerInviteCode(contest: string, event: { membership: Membership; snapshot: SyncSnapshotV1 } | undefined): string | undefined {
  if (event?.membership.role !== 'host' || event.membership.status !== 'approved') return undefined;
  return snapshotOwnerInviteCode(contest, event.snapshot);
}
