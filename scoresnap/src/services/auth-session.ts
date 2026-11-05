/** Profiles are display caches; only Supabase's session authorizes remote work. */
export function deriveSession(session: any) {
  if (!session?.user?.id) return { session: null, user: null, isAnonymous: false, remoteUserId: null };
  const source = session.user;
  const isAnonymous = source.is_anonymous === true;
  const candidate = source.app_metadata?.provider;
  const provider: 'anonymous' | 'apple' | 'google' | 'email' = isAnonymous ? 'anonymous' : candidate === 'apple' || candidate === 'google' ? candidate : 'email';
  const user = { id: source.id, email: source.email, name: source.user_metadata?.full_name, provider };
  return { session: { user }, user, isAnonymous, remoteUserId: source.id };
}

export function guestRouteReady(initialized: boolean, session: unknown): boolean {
  return initialized && !!session;
}
