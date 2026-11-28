// Local stand-in for the hosted backend, for a browser proof only.
// Real: every database function, run as the "authenticated" role with the caller's identity.
// Emulated: guest sign-in (no auth service here) and no realtime socket (the page falls back to polling).
const http = require('http');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const DB = process.env.WEB_LINKS_DB || 'postgresql://postgres@127.0.0.1:54777/postgres';
// How to run psql: set by run.sh (a local psql, or one inside a container when this machine has none).
const PSQL = process.env.WEB_LINKS_PSQL ? JSON.parse(process.env.WEB_LINKS_PSQL) : ['psql', DB];
// Loopback only: this stand-in must never be pointed at a hosted database.
if (!/^postgresql:\/\/postgres@127\.0\.0\.1:\d+\/postgres$/.test(DB)) { console.error('bridge: only a local throwaway database is allowed'); process.exit(2); }
const psql = (sql, vars = {}) => execFileSync(PSQL[0], [...PSQL.slice(1), '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', ...Object.entries(vars).flatMap(([k, v]) => ['-v', `${k}=${v}`])], { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const calls = [];
const signatures = new Map();
function signature(fn) {
  if (!signatures.has(fn)) signatures.set(fn, psql(`select coalesce(string_agg(format('%I => ((:''args''::jsonb)->>%L)::%s', n, n, t::regtype), ', ' order by o),'') from pg_proc p, unnest(p.proargnames, p.proargtypes::oid[]) with ordinality a(n,t,o) where p.pronamespace='public'::regnamespace and p.proname=:'fn';`.replace(":'fn'", `'${fn.replace(/[^a-z_]/g, '')}'`).replace(/:''args''/g, "PLACEHOLDER")).trim());
  return signatures.get(fn);
}
function session(id) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: id, role: 'authenticated', is_anonymous: true, exp, aud: 'authenticated' })}.local`;
  return { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: `r-${id}`,
    user: { id, aud: 'authenticated', role: 'authenticated', is_anonymous: true, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
}
http.createServer((q, s) => {
  let body = ''; q.on('data', c => body += c); q.on('end', () => {
    s.setHeader('access-control-allow-origin', '*'); s.setHeader('access-control-allow-headers', '*'); s.setHeader('access-control-allow-methods', '*');
    if (q.method === 'OPTIONS') return s.end();
    s.setHeader('content-type', 'application/json');
    const url = q.url.split('?')[0];
    try {
      if (url === '/auth/v1/signup') {
        const id = crypto.randomUUID();
        psql(`insert into auth.users(id,is_anonymous) values('${id}',true);`);
        calls.push('guest sign-in'); return s.end(JSON.stringify(session(id)));
      }
      const claims = (() => { try { return JSON.parse(Buffer.from((q.headers.authorization || '').split('.')[1] || '', 'base64url').toString()); } catch { return null; } })();
      if (url === '/auth/v1/token' && claims === null) { const id = JSON.parse(body).refresh_token.slice(2); return s.end(JSON.stringify(session(id))); }
      if (url === '/auth/v1/user') return s.end(JSON.stringify(session(claims.sub).user));
      if (url.startsWith('/rest/v1/rpc/')) {
        const fn = url.slice('/rest/v1/rpc/'.length);
        const named = signature(fn).replace(/PLACEHOLDER/g, ":'args'");
        const jwt = claims && claims.sub ? JSON.stringify({ sub: claims.sub, role: 'authenticated', is_anonymous: !!claims.is_anonymous }) : '{}';
        try {
          const out = psql(`begin; set local role ${claims && claims.sub ? 'authenticated' : 'anon'}; select set_config('request.jwt.claims', :'jwt', true) \\g /dev/null\nselect to_json(public.${fn.replace(/[^a-z_]/g, '')}(${named})); commit;`, { args: body || '{}', jwt });
          calls.push(`${fn} ok`); return s.end(out.trim() || 'null');
        } catch (e) {
          const text = String(e.stderr || e.message);
          const code = (text.match(/ERROR:\s+([0-9A-Z]{5}):/) || [])[1] || 'XX000';
          const message = (text.match(/ERROR:\s+[0-9A-Z]{5}:\s+(.*)/) || [])[1] || 'error';
          calls.push(`${fn} ${code} ${message}`);
          s.statusCode = code === '42501' ? 403 : 400; return s.end(JSON.stringify({ code, message, details: null, hint: null }));
        }
      }
      if (url === '/__calls') return s.end(JSON.stringify(calls));
      s.statusCode = 404; s.end('{}');
    } catch (e) { s.statusCode = 500; s.end(JSON.stringify({ message: String(e.message).slice(0, 300) })); }
  });
}).listen(54399, () => console.log('bridge on 54399'));
