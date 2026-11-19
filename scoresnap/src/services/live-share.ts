import { REAL_AUTH_CONFIGURED } from '../config/auth';
import { supabase } from '../db/supabase';
import type { Contest } from '../stores/contest-store';
import { buildSnapshot, validShareToken, type SharedRound } from './live-share-snapshot';
export { buildSnapshot, validShareToken } from './live-share-snapshot';
let queue = Promise.resolve();
export function publishSnapshot(contest: Contest): Promise<void> {
  if (!REAL_AUTH_CONFIGURED) return Promise.resolve();
  const task = queue.catch(() => {}).then(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || session.user.is_anonymous) throw new Error('Sign in to share a live scoreboard.');
    const { error } = await supabase.rpc('publish_shared_round', { p_local_id: contest.id, p_snapshot: buildSnapshot(contest) });
    if (error) throw new Error('Scoreboard sync failed. Try sharing again.');
  });
  queue = task;
  return task;
}
export async function createLiveLink(contest: Contest) {
  if (!REAL_AUTH_CONFIGURED) throw new Error('Live sharing needs a configured Supabase account. Offline scores stay on this device.');
  await publishSnapshot(contest);
  const { data, error } = await supabase.rpc('create_share_link', { p_local_id: contest.id });
  if (error || !validShareToken(data)) throw new Error('Could not create share link.');
  return data;
}
export async function revokeLiveLinks(localId: string) {
  if (!REAL_AUTH_CONFIGURED) return;
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
