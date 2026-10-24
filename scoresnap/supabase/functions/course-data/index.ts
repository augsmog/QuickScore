// @ts-nocheck -- Deno runtime imports and globals; pure logic is checked by app tsc/Jest.
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ATTRIBUTION, normalizeQuery, projectMonth, isQuotaResponse } from "./logic.ts";
const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "GET, OPTIONS" };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
const callers = new Map();
const positive = (name, fallback) => { const n = Number(Deno.env.get(name)); return Number.isInteger(n) && n > 0 ? n : fallback; };
// Hard ceilings: GolfCore Free is 500/month and 10/minute; env can only lower them (Starter needs Augie's yes + a code change).
const cap = Math.min(positive("GOLFCORE_MONTHLY_CAP", 500), 500);
const minuteCap = Math.min(positive("GOLFCORE_PER_MIN_CAP", 10), 10);
// Serialize ledger checks + calls in this isolate. Database reservations also protect across isolates.
let queue = Promise.resolve();
function serialized(fn) { const result = queue.then(fn); queue = result.catch(() => {}); return result; }
function checked(result) { if (result.error) throw new Error("database_error"); return result.data; }
function claims(req) {
  try { const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /i, ""); return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); }
  catch { return {}; }
}
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  // JWT signature validation is performed by the Supabase gateway (verify_jwt=true).
  const jwt = claims(req);
  if (!jwt.role) return json({ error: "unauthorized" }, 401);
  const params = new URL(req.url).searchParams;
  const admin = params.has("usage") || params.has("count");
  if (admin && jwt.role !== "service_role") return json({ error: "forbidden" }, 403);
  const now = Date.now();
  for (const [key, value] of callers) if (value.start < now - 60000) callers.delete(key);
  const caller = jwt.sub || req.headers.get("x-forwarded-for")?.split(',')[0] || "anonymous";
  const rate = callers.get(caller) ?? { start: now, calls: 0 };
  callers.set(caller, rate);
  if (++rate.calls > 30) return json({ error: "caller_rate_limited", fallback: "manual" }, 429);
  try {
    const db = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    if (params.get("usage") === "1") {
      const summary = checked(await db.from("golfcore_usage_summary").select('*').single());
      return json({ ...summary, cap, pct_used: summary.calls / cap * 100, projected_month_end: projectMonth(summary.calls, new Date()) });
    }
    let endpoint, path, table, key, keyValue, ttl;
    const modes = ['q','near','slug','count','usage'].filter(p => params.has(p));
    if (modes.length !== 1) return json({ error: "invalid_query" }, 400);
    if (params.has('slug')) {
      const slug = params.get('slug');
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 200) return json({ error: "invalid_slug" }, 400);
      endpoint = 'detail'; path = `/courses/${slug}`; table = 'course_catalog'; key = 'slug'; keyValue = slug; ttl = 90 * 86400000;
    } else if (params.get('count') === '1') {
      endpoint = 'count'; table = 'course_search_cache'; key = 'query'; keyValue = 'count:scorecard-rated:us-world:v1'; ttl = 86400000;
    } else {
      const search = new URLSearchParams();
      if (params.has('q')) {
        const q = normalizeQuery(params.get('q'));
        if (q.length < 2 || q.length > 200) return json({ error: "invalid_query" }, 400);
        search.set('q', q);
      } else if (params.has('near')) {
        const parts = params.get('near').split(','); const coords = parts.map(Number); const radius = Number(params.get('radius') ?? 25);
        if (parts.length !== 2 || parts.some(p => !p.trim()) || !coords.every(Number.isFinite) || Math.abs(coords[0]) > 90 || Math.abs(coords[1]) > 180 || !Number.isFinite(radius) || radius <= 0 || radius > 50) return json({ error: "invalid_location" }, 400);
        search.set('near', coords.join(',')); search.set('radius', String(radius));
      } else return json({ error: "invalid_query" }, 400);
      const limit = Number(params.get('limit') ?? 20);
      if (!Number.isInteger(limit) || limit < 1 || limit > 50) return json({ error: "invalid_limit" }, 400);
      search.set('limit', String(limit));
      if (params.has('coverage')) {
        const coverage = params.get('coverage');
        if (!['contours','traced','scorecard','rated','wind'].includes(coverage)) return json({ error: "invalid_coverage" }, 400);
        search.set('coverage', coverage);
      }
      endpoint = 'search'; path = `/courses?${search}`; table = 'course_search_cache'; key = 'query'; keyValue = search.toString(); ttl = 7 * 86400000;
    }
    const cached = checked(await db.from(table).select('*').eq(key, keyValue).maybeSingle());
    const output = (payload, source, exhausted = false) => {
      const attribution = endpoint === 'detail' && payload.url ? `${ATTRIBUTION} — ${payload.url}` : ATTRIBUTION;
      return json({ ...(endpoint === 'detail' ? { course: payload } : payload), source, attribution, ...(exhausted ? { quota_exhausted: true } : {}) });
    };
    if (cached && Date.now() - Date.parse(cached.fetched_at) < ttl) return output(cached.payload, 'cache');
    if (!Deno.env.get('GOLFCORE_API_KEY')) return json({ error: 'course_data_unconfigured' }, 503);
    return await serialized(async () => {
      async function upstream(upstreamPath) {
        // Atomic reservation serializes budget enforcement across every function instance.
        const allowed = checked(await db.rpc('reserve_golfcore_call', { p_endpoint: endpoint, p_monthly_cap: cap, p_minute_cap: minuteCap }));
        if (!allowed) throw new Error('quota_exhausted');
        const usageId = allowed;
        let response, body;
        try {
          response = await fetch(`https://api.golfcore.org/v1${upstreamPath}`, { headers: { Authorization: `Bearer ${Deno.env.get('GOLFCORE_API_KEY')}`, 'User-Agent': 'SnapScore/1.0 (+https://github.com/augsmog/QuickScore)' }, signal: AbortSignal.timeout(15000) });
          body = await response.json().catch(() => null);
        } catch { checked(await db.from('golfcore_usage').update({ status: 0 }).eq('id', usageId)); throw new Error('upstream_unavailable'); }
        const integerHeader = name => { const value = response.headers.get(name); return value !== null && /^\d+$/.test(value) ? Number(value) : null; };
        const quota = isQuotaResponse(response.status, body);
        checked(await db.from('golfcore_usage').update({ status: response.status, is_quota_error: quota,
          ratelimit_limit: integerHeader('X-RateLimit-Limit'), ratelimit_remaining: integerHeader('X-RateLimit-Remaining'), ratelimit_reset: response.headers.get('X-RateLimit-Reset'), retry_after: response.headers.get('Retry-After') }).eq('id', usageId));
        if (quota) throw new Error('quota_exhausted');
        if (!response.ok || !body) throw new Error('upstream_unavailable');
        return body;
      }
      try {
        let payload;
        if (endpoint === 'count') {
          payload = { measured_at: new Date().toISOString(), totals: {} };
          for (const country of ['', 'us']) for (const coverage of ['scorecard','rated']) {
            const result = await upstream(`/courses?coverage=${coverage}&limit=1${country ? '&country=us' : ''}`);
            payload.totals[`${country || 'world'}_${coverage}`] = result.total;
          }
        } else payload = await upstream(path);
        checked(await db.from(table).upsert({ [key]: keyValue, payload, fetched_at: new Date().toISOString(), ...(endpoint === 'detail' ? { source: 'golfcore' } : {}) }));
        return output(payload, 'golfcore');
      } catch (error) {
        const quota = error.message === 'quota_exhausted';
        if (cached) return output(cached.payload, 'cache', quota);
        return json({ error: quota ? 'quota_exhausted' : 'course_data_unavailable', fallback: 'manual' }, 503);
      }
    });
  } catch {
    console.error('course-data: request unavailable');
    return json({ error: 'course_data_unavailable', fallback: 'manual' }, 503);
  }
});
