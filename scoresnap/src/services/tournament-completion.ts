import type { OnlineRpc, OnlineSnapshot } from './online-client';
import type { Entry } from './score-outbox';
/** Submission is an online acknowledgment, never an offline promise. */
export function tournamentCompletion(deps: {
  rpc: OnlineRpc;
  actor(): Promise<string | null>;
  queue(): Promise<{ entries: Entry[] }>;
  refresh(id: string): Promise<OnlineSnapshot | null>;
}) {
  async function act(id: string, name: string, extra: Record<string, string>) {
    const actor = await deps.actor();
    if (!actor) throw Error('Sign in before submitting');
    const clean = async () => {
      const queue = await deps.queue();
      if (queue.entries.some(e => e.draft.contest_id === id)) throw Error('Resolve and sync all queued scores before submitting');
    };
    await clean();
    const snapshot = await deps.refresh(id);
    if (!snapshot || snapshot.completed || !snapshot.capabilities.enabled) throw Error('Refresh an active online tournament before submitting');
    await clean();
    if (await deps.actor() !== actor) throw Error('Identity changed during submission');
    const result = await deps.rpc(name, { contest_id: id, expected_revision: snapshot.revision, ...extra });
    if (result.error) throw result.error;
    await deps.refresh(id);
    return result.data;
  }
  return {
    submit: (id: string, round: string, group: string) => act(id, 'submit_group', { round_id: round, group_id: group }),
    finalize: (id: string) => act(id, 'finalize_tournament', {}),
  };
}
