/**
 * Google sign-in on iPhone, the standard installed-app way: open Google, get a one-time code
 * back, exchange it (with the PKCE verifier, no secret) for an ID token, and hand that ID token
 * to the backend. A fresh nonce ties the ID token to this one attempt: Google gets its SHA-256,
 * the backend gets the original and checks they match.
 *
 * Everything that touches the device is passed in, so this is tested without a phone.
 */
export const GOOGLE_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
};
export const GOOGLE_SCOPES = ['openid', 'profile', 'email'];
/** Where Google sends the user back: the app's own bundle id as the scheme. */
export const googleRedirectUri = (bundleId: string) => `${bundleId}:/oauthredirect`;

export type GoogleResult = { status: 'signed-in'; idToken: string; accessToken?: string; nonce: string } | { status: 'cancelled' };
/** A failure the person can act on. `reason` is for logs; `message` is what the screen shows. */
export class GoogleSignInError extends Error {
  constructor(public reason: 'denied' | 'no-code' | 'exchange' | 'no-id-token', message: string) { super(message); }
}

interface Prompt { type: string; params?: Record<string, string>; error?: { message?: string } | null }
export interface GoogleDeps {
  randomNonce: () => string;
  sha256: (text: string) => Promise<string>;
  /** Builds the request; `prompt` opens Google; `codeVerifier` is the PKCE secret made for it. */
  request: (config: { clientId: string; scopes: string[]; redirectUri: string; nonce: string }) => { prompt: () => Promise<Prompt>; codeVerifier: () => string | undefined };
  exchange: (config: { clientId: string; code: string; redirectUri: string; codeVerifier: string }) => Promise<{ idToken?: string | null; accessToken?: string | null }>;
}

export async function signInWithGoogleFlow(clientId: string, bundleId: string, deps: GoogleDeps): Promise<GoogleResult> {
  const nonce = deps.randomNonce();
  const redirectUri = googleRedirectUri(bundleId);
  const request = deps.request({ clientId, scopes: GOOGLE_SCOPES, redirectUri, nonce: await deps.sha256(nonce) });
  const result = await request.prompt();
  // Closing the sheet is a choice, not a failure.
  if (result.type === 'cancel' || result.type === 'dismiss') return { status: 'cancelled' };
  if (result.type !== 'success') throw new GoogleSignInError('denied', 'Google did not sign you in. Try again, or use Apple or email.');
  const code = result.params?.code, codeVerifier = request.codeVerifier();
  if (!code || !codeVerifier) throw new GoogleSignInError('no-code', 'Google did not finish signing you in. Try again.');
  let tokens: { idToken?: string | null; accessToken?: string | null };
  try { tokens = await deps.exchange({ clientId, code, redirectUri, codeVerifier }); }
  catch { throw new GoogleSignInError('exchange', 'Could not reach Google to finish signing in. Check your connection and try again.'); }
  if (!tokens.idToken) throw new GoogleSignInError('no-id-token', 'Google did not finish signing you in. Try again.');
  return { status: 'signed-in', idToken: tokens.idToken, accessToken: tokens.accessToken ?? undefined, nonce };
}
