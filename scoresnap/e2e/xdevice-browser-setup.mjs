// Disposable CI stack only. Never log Auth responses or persist credentials in artifacts.
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
const dir = process.env.RUNNER_TEMP;
const status = JSON.parse(await readFile(`${dir}/xdevice-status.json`, 'utf8'));
const url = status.API_URL;
assert.equal(url, 'http://127.0.0.1:54321');
for (const secret of [status.SERVICE_ROLE_KEY, status.ANON_KEY]) console.log(`::add-mask::${secret}`);
const env = { EXPO_PUBLIC_SUPABASE_URL: url, EXPO_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY };
for (const who of ['A', 'B', 'C', 'D']) {
  const email = `xdev-${who.toLowerCase()}-${randomBytes(8).toString('hex')}@example.test`;
  const password = randomBytes(32).toString('hex');
  for (const value of [email, password]) console.log(`::add-mask::${value}`);
  const response = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST', headers: { apikey: status.SERVICE_ROLE_KEY, Authorization: `Bearer ${status.SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  assert.equal(response.status, 200, `Create ordinary user ${who}`);
  const user = await response.json();
  assert.equal(user.is_anonymous, false);
  env[`XDEV_${who}_EMAIL`] = email;
  env[`XDEV_${who}_PASSWORD`] = password;
}
await writeFile(`${dir}/xdevice-browser.env`, Object.entries(env).map(([key, value]) => `export ${key}='${value}'`).join('\n'), { mode: 0o600 });
console.log('Created four confirmed ordinary email/password users on disposable local Auth');
