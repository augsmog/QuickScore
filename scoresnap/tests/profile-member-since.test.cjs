// Sign-off sheets for 0853a23 (27 Nov): Profile said "Member since 2026" to a guest. The year was
// simply the current year, for everyone: not when anyone joined, and it would have changed every
// January. A guest now sees no such line. A signed-in user sees the year their account was
// created, as the server reports it; if that is not known the line is left out, never guessed.
const fs = require('node:fs');
const ts = require('typescript');
const load = (file) => { const m = { exports: {} }; new Function('module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(m, m.exports); return m.exports; };
const { memberSinceYear } = load('src/services/member-since.ts');
const { deriveSession } = load('src/services/auth-session.ts');
const profile = fs.readFileSync('app/(tabs)/profile.tsx', 'utf8');

test('a guest has no "Member since"', () => {
  expect(memberSinceYear(null)).toBeNull();
  expect(memberSinceYear(undefined)).toBeNull();
  expect(memberSinceYear({ id: 'anon-1795800000000', name: 'Golfer', provider: 'anonymous' })).toBeNull();
  // a server-side guest has a creation date, and is still a guest
  expect(memberSinceYear({ id: 'u1', provider: 'anonymous', createdAt: '2026-11-18T18:55:55Z' })).toBeNull();
});

test('a signed-in user sees the year the account was created', () => {
  expect(memberSinceYear({ id: 'u2', provider: 'apple', createdAt: '2026-10-22T03:04:05Z' })).toBe(2026);
  expect(memberSinceYear({ id: 'u3', provider: 'email', createdAt: '2027-01-02T00:00:00Z' })).toBe(2027);
  expect(memberSinceYear({ id: 'u4', provider: 'google', createdAt: '2025-06-30T12:00:00+00:00' })).toBe(2025);
});

test('unknown or unreadable creation date: no line, no guess', () => {
  expect(memberSinceYear({ id: 'u5', provider: 'email' })).toBeNull();
  expect(memberSinceYear({ id: 'u6', provider: 'email', createdAt: 'not a date' })).toBeNull();
  expect(memberSinceYear({ id: 'u7', provider: 'email', createdAt: '' })).toBeNull();
});

test('the creation date comes from the server session', () => {
  const signedIn = deriveSession({ user: { id: 'u8', email: 'a@b.co', created_at: '2026-10-22T03:04:05Z', app_metadata: { provider: 'apple' } } });
  expect(signedIn.user.createdAt).toBe('2026-10-22T03:04:05Z');
  expect(memberSinceYear(signedIn.user)).toBe(2026);
  const guest = deriveSession({ user: { id: 'u9', is_anonymous: true, created_at: '2026-11-18T18:55:55Z' } });
  expect(memberSinceYear(guest.user)).toBeNull();
  expect(deriveSession(null).user).toBeNull();
});

test('Profile shows the line only when there is a year, and never the current year', () => {
  expect(profile).not.toMatch(/new Date\(\)\.getFullYear\(\)/);
  expect(profile).toContain('const memberYear = memberSinceYear(authUser);');
  expect(profile).toMatch(/\{memberYear !== null && \(\s*<Text[^>]*>Member since \{memberYear\}<\/Text>\s*\)\}/);
  expect(profile.split('Member since').length - 1).toBe(1);
});
