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
  let claimed = false, sent = false, attempts = 0, active = false, token = null;
  const client = {
    from(table) {
      let value;
      const filters = {};
      const query = {
        upsert(v) { value = v; operations.push({ table, type: 'upsert', value: v }); return query; },
        insert(v) { operations.push({ table, type: 'insert', value: v }); return Promise.resolve({}); },
        update(v) { value = v; operations.push({ table, type: 'update', value: v }); return query; },
        select() { if (table === 'signup_processing') { const data = claimed ? [] : [{user_id:'user'}]; claimed = true; return Promise.resolve({data}); } return query; },
        eq(key, value) { filters[key] = value; return query; }, is() { return query; }, neq() { return query; },
        single() { return Promise.resolve({ data: { id: 'referrer', email: 'friend@example.test', referral_code: 'SS-EXIST', referral_count: count } }); },
        maybeSingle() { return query.single(); },
        then(resolve) {
          if (table === 'signup_processing' && value?.email_status === 'failed' &&
              filters.user_id === 'user' && filters.email_reservation_token === token &&
              filters.email_status === 'pending' && active) active = false;
          resolve({});
        },
      };
      return query;
    },
    rpc(name, args) {
      operations.push({table:'rpc', type:name, value:args || {}});
      if (name === 'get_signup_webhook_secret') return Promise.resolve({data:env.RPC_SECRET});
      if (name === 'apply_signup_referral') { operations.push({value:{referral_count:count+1}}); return Promise.resolve({data:[{referrer_id:'referrer',new_count:count+1}]}); }
      if (name === 'claim_signup_email') { const ok = !sent && !active && attempts < 3; if(ok) { if (args.p_provider_configured) attempts++; active=true; token=args.p_token; } return Promise.resolve({data:ok}); }
      if (name === 'confirm_signup_email') { if (active && args.p_token === token && args.p_user_id === 'user') { sent=true; active=false; } return Promise.resolve({}); }
      return Promise.resolve({});
    },
  };
  const context = {
    ...lib, Response, TextEncoder, crypto: webcrypto,
    Deno: { env: { get: key => env[key] } },
    serve: fn => { handler = fn; }, createClient: jest.fn(() => client),
    fetch: async (_url, options) => { emails.push(JSON.parse(options.body)); if (context.transport) return context.transport(options); if (status === 'network') throw Error('network'); return { ok: status >= 200 && status < 300, status, json: async () => status === 204 ? {} : {id:'email-id'} }; },
    console: { error: (...args) => errors.push(args), log: (...args) => errors.push(args) },
  };
  vm.runInNewContext(compile(source.replace(/^import .*;\n/gm, '')), context);
  return { handler, operations, emails, errors, context, expire: () => { active=false; }, state: () => ({active,sent,attempts,token}) };
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
    expect(h.operations.every(op => op.type === 'get_signup_webhook_secret')).toBe(true);
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
    expect(settings.unsubscribeUrl).toBe(env.EMAIL_UNSUBSCRIBE_URL || 'mailto:hello@snapscore.autumn8.me?subject=Unsubscribe%20from%20SnapScore%20emails');
    for (const payload of [lib.buildWelcomeEmail('user@example.test', '<code>&', settings), lib.buildRewardEmail('user@example.test', settings)]) {
      expect(payload.from).toBe(env.EMAIL_FROM || 'SnapScore <hello@snapscore.autumn8.me>');
      expect(payload.reply_to).toBe(env.EMAIL_REPLY_TO || 'hello@snapscore.autumn8.me');
      expect(payload.headers['List-Unsubscribe']).toBe(`<${settings.unsubscribeUrl}>`);
      expect(payload.html).toContain(`href="${lib.escapeHtml(settings.unsubscribeUrl)}"`);
      expect(payload.html).toContain('Unsubscribe</a>');
      expect(JSON.stringify(payload)).not.toContain('ScoreSnap');
      expect(payload.subject).toBe(payload.subject.startsWith('Welcome') ? "Welcome to SnapScore — let's set up your first round" : 'You earned a free month of Pro.');
    }
    const welcome = lib.buildWelcomeEmail('user@example.test', '<code>&', settings);
    expect(welcome.html).toContain('Autumn8me, Inc.');
    expect(lib.buildRewardEmail('user@example.test', settings).html).not.toContain('SnapScore by Autumn8me, Inc.');
    expect(welcome.html).not.toContain('&lt;code&gt;&amp;');
    expect(welcome.html.split('50+ game modes')).toHaveLength(2);
  }
});
test('non-2xx email responses log only status and signup continues', async () => {
  const h = harness({ SIGNUP_WEBHOOK_SECRET: 'test-secret', RESEND_API_KEY: 'fake-test-key', REFERRAL_PREMIUM_REWARD_ENABLED: 'true' }, 2, 429);
  expect((await h.handler(request())).status).toBe(200);
  expect(h.errors).toEqual([['Email send failed:', 429], ['Email send failed:', 429]]);
  expect(h.emails).toHaveLength(2);
});

test('replays and overlapping deliveries claim effects and welcome once', async () => {
  for (const concurrent of [false, true]) {
    const h = harness({SIGNUP_WEBHOOK_SECRET:'test-secret', RESEND_API_KEY:'fake'});
    const responses = concurrent ? await Promise.all([h.handler(request()),h.handler(request())]) : [await h.handler(request()),await h.handler(request())];
    const bodies = await Promise.all(responses.map(response => response.json()));
    expect(bodies.filter(body => body.duplicate)).toHaveLength(1);
    expect(bodies.filter(body => body.success)).toHaveLength(1);
    expect(h.operations.filter(x=>x.type==='apply_signup_referral')).toHaveLength(1);
    expect(h.operations.filter(x=>x.value.event_name==='user_signup')).toHaveLength(1);
    expect(h.emails).toHaveLength(1);
    expect(h.operations.filter(x=>x.type==='confirm_signup_email')).toHaveLength(1);
    expect(h.operations.filter(x=>x.type==='upsert').every(x=>!('onboarding_email_sent' in x.value))).toBe(true);
    expect(h.operations.some(x=>x.value.referral_code)).toBe(false);
  }
});
test('confirmation requires 2xx with id; failures retry at most three times', async () => {
  for (const status of [200, 204, 429, 'network']) {
    const h = harness({SIGNUP_WEBHOOK_SECRET:'test-secret', RESEND_API_KEY:'fake'},2,status);
    for(let i=0;i<5;i++) expect((await h.handler(request())).status).toBe(200);
    expect(h.operations.filter(x=>x.type==='confirm_signup_email')).toHaveLength(status===200 ? 1 : 0);
    expect(h.emails).toHaveLength(status===200 ? 1 : 3);
  }
});
test('missing provider processes signup without reserving an email attempt', async () => {
  const h=harness({SIGNUP_WEBHOOK_SECRET:'test-secret'});
  await h.handler(request()); await h.handler(request());
  expect(h.emails).toHaveLength(0);
  expect(h.operations.filter(x=>x.type==='claim_signup_email').every(x=>x.value.p_provider_configured===false)).toBe(true);
  expect(h.state().attempts).toBe(0);
  expect(h.operations.some(x=>x.value.email_status==='failed')).toBe(true);
  expect(h.errors[0]).toEqual(['[EMAIL SKIPPED] provider not configured']);
});
test('secret uses env first, otherwise cached vault RPC, otherwise fails closed', async () => {
  const env=harness({SIGNUP_WEBHOOK_SECRET:'test-secret',RPC_SECRET:'wrong'});
  expect((await env.handler(request())).status).toBe(200);
  expect(env.operations.some(x=>x.type==='get_signup_webhook_secret')).toBe(false);
  const rpc=harness({RPC_SECRET:'test-secret'});
  expect((await rpc.handler(request())).status).toBe(200);
  expect((await rpc.handler(request())).status).toBe(200);
  expect(rpc.operations.filter(x=>x.type==='get_signup_webhook_secret')).toHaveLength(1);
  expect((await harness().handler(request())).status).toBe(503);
});
test('migration privilege, atomicity and non-blocking webhook contract', () => {
  const root=path.join(__dirname,'../supabase/migrations');
  const sql=fs.readFileSync(path.join(root,'20261101003300_signup_processing.sql'),'utf8');
  const trigger=fs.readFileSync(path.join(root,'20261101003400_signup_webhook_trigger.sql'),'utf8');
  expect(sql).toContain('enable row level security');
  expect(sql).toContain('from public, anon, authenticated');
  expect(sql).toContain('to service_role');
  expect(sql).toContain("set search_path = ''");
  expect(sql).toContain('referral_applied = false');
  expect(sql).toContain('coalesce(p.referral_count, 0) + 1');
  expect(sql).toContain('p.id <> p_user_id');
  expect(sql).toContain("where user_id = p_user_id and email_reservation_token = p_token and email_status = 'pending'");
  expect(sql).toContain("updated_at < now() - interval '5 minutes'");
  expect(trigger).toContain('grant execute on function public.dispatch_signup_webhook() to service_role;');
  expect(trigger).toContain('create extension if not exists pg_net');
  expect(trigger).toContain('exception when query_canceled or assert_failure or others then');
  expect(trigger).toContain("current_setting('app.settings.supabase_url', true)");
  expect(trigger).toContain('vault.decrypted_secrets');
  expect(trigger).not.toMatch(/eyJ|https:\/\/[^' ]+supabase\.co/);
});

test.each([true, false])('expired owner cannot complete or fail a newer pending reservation (success=%s)', async success => {
  const env = {SIGNUP_WEBHOOK_SECRET:'test-secret', RESEND_API_KEY:'fake'};
  const h = harness(env);
  const pending = [], keys = [], arrivals = [];
  const started = [new Promise(resolve => arrivals.push(resolve)), new Promise(resolve => arrivals.push(resolve))];
  h.context.transport = options => new Promise(resolve => {
    keys.push(options.headers['Idempotency-Key']);
    pending.push(resolve);
    arrivals[pending.length - 1]();
  });
  const a = h.handler(request());
  await started[0];
  const oldToken = h.state().token;
  h.expire();
  const b = h.handler(request());
  await started[1];
  const newToken = h.state().token;
  expect(newToken).not.toBe(oldToken);
  // An unconfigured isolate cannot clear B's active reservation either.
  delete env.RESEND_API_KEY;
  await h.handler(request());
  env.RESEND_API_KEY = 'fake';
  expect(h.state().active).toBe(true);
  pending[0]({ok:success,status:success?200:429,json:async()=>({id:'old-id'})});
  await a;
  expect(h.state()).toEqual({active:true,sent:false,attempts:2,token:newToken});
  await h.handler(request());
  expect(pending).toHaveLength(2);
  expect(keys).toEqual(['signup-welcome/user','signup-welcome/user']);
  pending[1]({ok:true,status:200,json:async()=>({id:'new-id'})});
  await b;
  expect(h.state().sent).toBe(true);
});
