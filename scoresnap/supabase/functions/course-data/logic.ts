export const ATTRIBUTION = "Course data: GolfCore";
export function normalizeQuery(input: string): string {
  return input.trim().replace(/\s+/g, " ").toLowerCase();
}
export function guardDecision(calls: number, minuteCalls: number, remaining: number | null, cap = 500, minuteCap = 9, cacheHit = false): boolean {
  return cacheHit || (calls < Math.min(cap, 500) && minuteCalls < Math.min(minuteCap, 9) && remaining !== 0);
}
export function projectMonth(calls: number, now: Date): number {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  return calls === 0 ? 0 : calls / Math.max((now.getTime() - start) / (end - start), 1 / (end - start));
}
const number = (v: unknown): number | null => typeof v === "number" && Number.isFinite(v) ? v : null;
export function mapSearch(c: any) {
  return { id: c.slug, name: c.name ?? "", city: c.city ?? "", state: c.region ?? "", country: c.country ?? "", holes: number(c.hole_count), latitude: number(c.lat), longitude: number(c.lng), url: c.url ?? "" };
}
export function mapCourse(c: any) {
  const layouts: any[] = c.layouts ?? [];
  const tees = layouts.flatMap(l => (l.tees ?? []).map((t: any) => ({ ...t, layout: l })));
  return { ...mapSearch(c), address: c.address ?? "", phone: c.phone ?? "", website: c.website ?? "",
    teeBoxes: tees.map(t => {
      const duplicates = tees.filter(other => other.name === t.name);
      const category = t.gender === "F" || t.gender === "female" ? "W" : t.gender === "male" ? "M" : t.gender;
      const name = `${t.name ?? "Unnamed tee"}${duplicates.some(o => o.gender !== t.gender) ? ` (${category})` : ""}${duplicates.some(o => o.layout !== t.layout) ? ` — ${t.layout.name}` : ""}`;
      // Explicit empty/partial tee cards remain empty/partial. Only absent cards use reference par/SI.
      const reference = t.holes == null;
      const holes: any[] = reference ? t.layout.holes ?? [] : t.holes;
      return { name, color: (t.name ?? "").toLowerCase(), courseRating: number(t.rating), slopeRating: number(t.slope), totalYards: number(t.yards), totalMeters: null,
        holes: holes.map(h => ({ number: number(h.position), par: number(h.par), handicap: number(h.stroke_index), yards: reference ? null : number(h.yards), meters: null })) };
    }) };
}

export function isQuotaResponse(status: number, body: any, headers?: { get(name: string): string | null }): boolean {
  const signals = JSON.stringify(body ?? {}) + ' ' + ['X-RateLimit-Reason', 'X-RateLimit-Period', 'X-RateLimit-Reset', 'X-Quota-Exceeded', 'X-RateLimit-Quota', 'X-RateLimit-Scope'].map(name => headers?.get(name) ?? '').join(' ');
  // X-RateLimit-* is the monthly meter: a 429 with Remaining > 0 is per-minute and must never trip the month.
  const remaining = headers?.get('X-RateLimit-Remaining') ?? null;
  const explicit = /quota[_ -]?(exceeded|exhausted)|(?:exceeded|exhausted)[_ -]?quota/i;
  // On a 429 the official monthly header wins over any body text: Remaining > 0 means per-minute.
  if (status === 429 && remaining !== null && /^\d+$/.test(remaining)) return remaining === '0';
  if (body?.quota_exceeded === true || body?.quota_exhausted === true) return true;
  if (status >= 400 && explicit.test(signals)) return true;
  return status >= 400 && /month/i.test(signals);
}

export function retryDelay(retryAfter: string | null, attempt: number): number {
  const seconds = retryAfter !== null && /^\d+(?:\.\d+)?$/.test(retryAfter.trim()) ? Number(retryAfter) : NaN;
  return Number.isFinite(seconds) ? Math.min(seconds, 8) * 1000 : 2000 * (attempt + 1);
}
