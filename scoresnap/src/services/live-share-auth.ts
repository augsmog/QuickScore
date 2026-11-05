type ShareSession = { user: { id: string; is_anonymous?: boolean } } | null;

/** Reject work queued under one account if Supabase now has another session. */
export function assertLiveShareActor(session: ShareSession, expectedActorId: string | null): asserts session is NonNullable<ShareSession> {
  if (!session || session.user.is_anonymous || !expectedActorId || session.user.id !== expectedActorId) {
    throw new Error('Account changed. Reopen live sharing to continue.');
  }
}
