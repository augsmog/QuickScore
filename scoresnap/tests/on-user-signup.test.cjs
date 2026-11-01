const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { webcrypto } = require('node:crypto');
const dir = path.join(__dirname, '../supabase/functions/on-user-signup');
const source = fs.readFileSync(path.join(dir, 'index.ts'), 'utf8');
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const libContext = { exports: {}, crypto: webcrypto, TextEncoder };
vm.runInNewContext(compile(fs.readFileSync(path.join(dir, 'lib.ts'), 'utf8')), libContext);
const lib = libContext.exports;
function harness(env = {}, count = 2, status = 200) {
  let handler;
  const operations = [], emails = [], errors = [];
  const client = {
    from(table) {
      const query = {
        upsert(value) { operations.push({ table, type: 'upsert', value }); return Promise.resolve({}); },
        insert(value) { operations.push({ table, type: 'insert', value }); return Promise.resolve({}); },
        update(value) { operations.push({ table, type: 'update', value }); return query; },
        select() { return query; }, eq() { return query; },
        single() { return Promise.resolve({ data: { id: 'referrer', email: 'friend@example.test', referral_count: count } }); },
      };
      return query;
    }, rpc() { return Promise.resolve({}); },
  };
  const context = {
    ...lib, Response, TextEncoder, crypto: webcrypto,
    Deno: { env: { get: key => env[key] } },
    serve: fn => { handler = fn; }, createClient: jest.fn(() => client),
    fetch: async (_url, options) => { emails.push(JSON.parse(options.body)); return { ok: status < 300, status }; },
    console: { error: (...args) => errors.push(args) },
  };
  vm.runInNewContext(compile(source.replace(/^import .*;\n/gm, '')), context);
  return { handler, operations, emails, errors, context };
}
function request(secret = 'test-secret', method = 'POST') {
  return new Request('https://example.test', { method, headers: secret === null ? {} : { 'x-webhook-secret': secret }, ...(method === 'POST' ? { body: JSON.stringify({ record: { id: 'user', email: 'user@example.test', user_metadata: { referred_by: 'SS-TEST' } } }) } : {}) });
}
test('secret gate fails closed before parsing or work; correct secret passes; non-POST stays 405', async () => {
  for (const [env, supplied, expected] of [[{}, null, 503], [{ SIGNUP_WEBHOOK_SECRET: '' }, 'x', 503], [{ SIGNUP_WEBHOOK_SECRET: 'test-secret' }, null, 401], [{ SIGNUP_WEBHOOK_SECRET: 'test-secret' }, 'wrong', 401]]) {
    const h = harness(env);
    const req = request(supplied);
    req.json = () => { throw Error('must not parse'); };
    const response = await h.handler(req);
    expect(response.status).toBe(expected);
    expect(await response.text()).toBe('Request unavailable');
    expect(h.context.createClient).not.toHaveBeenCalled();
    expect(h.emails).toHaveLength(0);
  }
  const h = harness({ SIGNUP_WEBHOOK_SECRET: 'test-secret' });
  expect((await h.handler(request())).status).toBe(200);
  expect((await h.handler(request(null, 'GET'))).status).toBe(405);
});
test('reward default off and exact true on, while count and event always persist', async () => {
  for (const flag of [undefined, '', 'false', 'TRUE', 'true ', 'true']) {
    const h = harness({ SIGNUP_WEBHOOK_SECRET: 'test-secret', RESEND_API_KEY: 'fake-test-key', REFERRAL_PREMIUM_REWARD_ENABLED: flag });
    await h.handler(request());
    expect(h.operations.some(op => op.value.referral_count === 3)).toBe(true);
    expect(h.operations.some(op => op.value.event_name === 'referral_signup')).toBe(true);
    const premium = h.operations.filter(op => op.value.is_premium);
    expect(premium).toHaveLength(flag === 'true' ? 1 : 0);
    expect(h.emails).toHaveLength(flag === 'true' ? 2 : 1);
    if (premium.length) expect(premium[0].value.premium_source).toBe('referral_reward');
  }
  const h = harness({ SIGNUP_WEBHOOK_SECRET: 'test-secret', REFERRAL_PREMIUM_REWARD_ENABLED: 'true' }, 3);
  await h.handler(request());
  expect(h.operations.some(op => op.value.is_premium)).toBe(false);
});
test('both payloads have sender/reply defaults and overrides, escaped footer, and brand', () => {
  for (const env of [{}, { EMAIL_FROM: 'Custom <sender@example.test>', EMAIL_REPLY_TO: 'reply@example.test', EMAIL_UNSUBSCRIBE_URL: 'https://example.test/?a="<&b=1' }]) {
    const settings = lib.emailSettings(env);
    expect(settings.unsubscribeUrl).toBe(env.EMAIL_UNSUBSCRIBE_URL || 'mailto:hello@scoresnap.app?subject=Unsubscribe%20from%20SnapScore%20emails');
    for (const payload of [lib.buildWelcomeEmail('user@example.test', '<code>&', settings), lib.buildRewardEmail('user@example.test', settings)]) {
      expect(payload.from).toBe(env.EMAIL_FROM || 'SnapScore <hello@scoresnap.app>');
      expect(payload.reply_to).toBe(env.EMAIL_REPLY_TO || 'hello@scoresnap.app');
      expect(payload.headers['List-Unsubscribe']).toBe(`<${settings.unsubscribeUrl}>`);
      expect(payload.html).toContain(`href="${lib.escapeHtml(settings.unsubscribeUrl)}"`);
      expect(payload.html).toContain('Unsubscribe</a>');
      expect(JSON.stringify(payload)).not.toContain('ScoreSnap');
      expect(payload.subject).toContain('SnapScore');
    }
    const welcome = lib.buildWelcomeEmail('user@example.test', '<code>&', settings);
    expect(welcome.html).toContain('SnapScore by Autumn8me, Inc.');
    expect(lib.buildRewardEmail('user@example.test', settings).html).not.toContain('SnapScore by Autumn8me, Inc.');
    expect(welcome.html).toContain('&lt;code&gt;&amp;');
    expect(welcome.html.split('50+ game modes')).toHaveLength(2);
  }
});
test('non-2xx email responses log only status and signup continues', async () => {
  const h = harness({ SIGNUP_WEBHOOK_SECRET: 'test-secret', RESEND_API_KEY: 'fake-test-key', REFERRAL_PREMIUM_REWARD_ENABLED: 'true' }, 2, 429);
  expect((await h.handler(request())).status).toBe(200);
  expect(h.errors).toEqual([['Email send failed:', 429], ['Email send failed:', 429]]);
  expect(h.emails).toHaveLength(2);
});
