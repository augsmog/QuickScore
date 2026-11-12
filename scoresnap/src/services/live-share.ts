import { REAL_AUTH_CONFIGURED } from '../config/auth';
import { supabase } from '../db/supabase';
import type { Contest } from '../stores/contest-store';
import { useAuthStore } from '../stores/auth-store';
import { assertLiveShareActor } from './live-share-auth';
import { buildSnapshot, validShareToken, type SharedRound } from './live-share-snapshot';
export { buildSnapshot, validShareToken } from './live-share-snapshot';
let queue = Promise.resolve();
function actorIdNow() {
  const auth = useAuthStore.getState();
  return auth.user?.id ?? auth.remoteUserId ?? null;
}
export function publishSnapshot(contest: Contest, expectedActorId = actorIdNow()): Promise<void> {
  if (!REAL_AUTH_CONFIGURED) return Promise.resolve();
  const task = queue.catch(() => {}).then(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    assertLiveShareActor(session, expectedActorId);
    const { error } = await supabase.rpc('publish_shared_round', { p_local_id: contest.id, p_snapshot: buildSnapshot(contest) });
    if (error) throw new Error('Scoreboard sync failed. Try sharing again.');
  });
  queue = task;
  return task;
}
export async function createLiveLink(contest: Contest, expectedActorId = actorIdNow()) {
  if (!REAL_AUTH_CONFIGURED) throw new Error('Live sharing needs a configured Supabase account. Offline scores stay on this device.');
  await publishSnapshot(contest, expectedActorId);
  const { data: { session } } = await supabase.auth.getSession();
  assertLiveShareActor(session, expectedActorId);
  const { data, error } = await supabase.rpc('create_share_link', { p_local_id: contest.id });
  if (error || !validShareToken(data)) throw new Error('Could not create share link.');
  return data;
}
export async function revokeLiveLinks(localId: string, expectedActorId = actorIdNow()) {
  if (!REAL_AUTH_CONFIGURED) return;
  const { data: { session } } = await supabase.auth.getSession();
  assertLiveShareActor(session, expectedActorId);
  const { error } = await supabase.rpc('revoke_share_links', { p_local_id: localId });
  if (error) throw new Error('Could not revoke links. Try again.');
}
export async function getSharedRound(token: string): Promise<SharedRound> {
  if (!validShareToken(token)) throw new Error('Invalid share link.');
  // No session required: capability is checked inside the RPC.
  const { data, error } = await supabase.rpc('get_shared_round', { p_token: token });
  if (error) {
    if (error.message.includes('expired')) throw new Error('This share link has expired.');
    if (error.message.includes('revoked')) throw new Error('This share link has been revoked.');
    if (error.message.includes('invalid')) throw new Error('Invalid share link.');
    throw new Error('Unable to load scoreboard. Reconnecting…');
  }
  return data as SharedRound;
}
