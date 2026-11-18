// AUG-259: guest join by code calls supabase.auth.signInAnonymously (cross-device.ts remoteIdentity).
// Local auth config must keep anonymous sign-ins on, matching the live setting the join flow needs.
const fs = require('node:fs');
const path = require('node:path');
const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
test('join flow relies on anonymous sign-in', () => {
  expect(read('src/services/cross-device.ts')).toMatch(/signInAnonymously/);
});
test('supabase auth config enables anonymous sign-ins', () => {
  const auth = read('supabase/config.toml').split(/^\[auth\]\s*$/m)[1].split(/^\[/m)[0];
  expect(auth).toMatch(/^enable_anonymous_sign_ins\s*=\s*true\s*$/m);
});
