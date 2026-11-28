// Google sign-in: one-time code, exchanged for an ID token, tied to this attempt by a nonce.
const loader = require('./helpers/load-ts.cjs');
const { signInWithGoogleFlow, googleRedirectUri, GoogleSignInError } = loader({})('src/services/google-sign-in.ts');

function deps({ prompt = { type: 'success', params: { code: 'one-time-code' } }, tokens = { idToken: 'id.jwt', accessToken: 'access' }, verifier = 'pkce-verifier', exchangeFails = false } = {}) {
  const seen = {};
  return { seen,
    randomNonce: () => 'raw-nonce',
    sha256: async text => `sha256(${text})`,
    request: config => { seen.request = config; return { prompt: async () => prompt, codeVerifier: () => verifier }; },
    exchange: async config => { seen.exchange = config; if (exchangeFails) throw Error('network'); return tokens; } };
}
const run = d => signInWithGoogleFlow('123-abc.apps.googleusercontent.com', 'com.scoresnap.app', d);

test('the happy path: code out, ID token back, with the pieces each side needs', async () => {
  const d = deps();
  expect(await run(d)).toEqual({ status: 'signed-in', idToken: 'id.jwt', accessToken: 'access', nonce: 'raw-nonce' });
  // Google is sent the hash of the nonce, never the nonce itself; the backend gets the original.
  expect(d.seen.request).toEqual({ clientId: '123-abc.apps.googleusercontent.com', scopes: ['openid', 'profile', 'email'], redirectUri: 'com.scoresnap.app:/oauthredirect', nonce: 'sha256(raw-nonce)' });
  // The exchange uses the same return address and the PKCE verifier, and no client secret.
  expect(d.seen.exchange).toEqual({ clientId: '123-abc.apps.googleusercontent.com', code: 'one-time-code', redirectUri: 'com.scoresnap.app:/oauthredirect', codeVerifier: 'pkce-verifier' });
  expect(googleRedirectUri('com.scoresnap.app')).toBe('com.scoresnap.app:/oauthredirect');
});

test('closing the Google sheet is a quiet cancel, and nothing is exchanged', async () => {
  for (const type of ['cancel', 'dismiss']) {
    const d = deps({ prompt: { type } });
    expect(await run(d)).toEqual({ status: 'cancelled' });
    expect(d.seen.exchange).toBeUndefined();
  }
});

test.each([
  ['Google refuses', { prompt: { type: 'error', error: { message: 'access_denied' } } }, 'denied'],
  ['no code comes back', { prompt: { type: 'success', params: {} } }, 'no-code'],
  ['the PKCE verifier is missing', { verifier: null }, 'no-code'],
  ['the exchange cannot reach Google', { exchangeFails: true }, 'exchange'],
  ['the exchange returns no ID token', { tokens: { accessToken: 'access' } }, 'no-id-token'],
])('%s: a clear failure the screen can show, never a half sign-in', async (_name, options, reason) => {
  const failure = await run(deps(options)).catch(e => e);
  expect(failure).toBeInstanceOf(GoogleSignInError);
  expect(failure.reason).toBe(reason);
  expect(failure.message).toMatch(/Try again|try again/);
  expect(failure.message).not.toMatch(/access_denied|network|undefined/);
});
