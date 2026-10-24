# Course data

The app uses its existing Supabase client and anon/user JWT to call the `course-data` Edge Function. JWT verification stays enabled at the gateway. The provider key (`GOLFCORE_API_KEY`) and service-role database key stay server-side. No direct provider calls occur in the app. Search is enabled only by `EXPO_PUBLIC_FEATURE_COURSE_SEARCH=true`.

The function allows GET search (`q`, or `near=lat,lng&radius=miles`), detail (`slug`), service-role count (`count=1`), and service-role usage (`usage=1`). Query length is at least two characters, radius at most 50 miles, and limit at most 50. No arbitrary paths, offsets, bulk exports, or general proxy are exposed. Search cache keys normalize case and whitespace. Search results persist for seven days, detail records for 90 days, and measured counts for 24 hours. Stale records remain available when upstream fails or the guard blocks refresh. Tables have RLS enabled and no client policies; only the function's service role accesses them.

GolfCore data stays tagged `source=golfcore` in a read-through catalog. Do not redistribute it, resell it, merge it into an owned database, or use it to build a competing database. Display “Course data: GolfCore” and link to the supplied course URL. The tee picker provides that credit. Preserve tee gender categories, ratings, stroke indexes, and missing fields. An explicit empty/partial tee card never borrows layout yardages. Only an absent tee card uses layout par/stroke indexes, with yardages left blank. Incomplete cards open manual entry for a complete 9/18-hole card before entering the scoring engine.

## Budget and ledger

Default caps: 500/month and 10/minute, configurable using `GOLFCORE_MONTHLY_CAP` and `GOLFCORE_PER_MIN_CAP`. The provider resets on the first UTC day of each month. `reserve_golfcore_call` takes a transaction advisory lock, checks month/minute counts and latest non-null remaining header this month, and inserts a ledger row before each upstream call. This protects the shared budget across concurrent isolates. Failed network calls and interrupted requests conservatively retain a slot with status 0; no automatic retry occurs. Each completed response records status, quota-error flag, X-RateLimit-Limit/Remaining/Reset and Retry-After. Four count probes each consume/log one call. Cache hits consume no calls. A light in-memory 30 requests/minute/sub-or-IP limit protects individual isolates; it is not a distributed caller limit.

The SQL view `golfcore_usage_summary` reports UTC month, calls, cap (500), percent used, projection based on elapsed fractional UTC month, quota errors, latest non-null remaining header and last call time. The service-role-only usage endpoint adjusts cap/percent for the configured environment cap. It reads the ledger without spending a provider call; `/v1/usage` is intentionally not called. Reservations mean calls can slightly overstate actual traffic after crashes, which is safer than overspending.

At a guard limit, stale search data returns `quota_exhausted:true`; with no cached data the function returns 503 `quota_exhausted` and `fallback:manual`. Detail can also return stale cache. Upstream/database errors return cached data when available or a generic 503/manual response with no secrets or stack traces. The app shows “Course search is resting, enter holes manually” for quota exhaustion.

## Usage alert operation

Coordinator must wire a scheduled server-side monitor (never expose its service-role JWT in the app) to `GET /functions/v1/course-data?usage=1`:

- 70% used **or** projected month end >500: Needs-you card **“Upgrade GolfCore to Starter ($10/mo)?”**
- 90% used **or** any quota error/429 this month: urgent.
- Starter upgrade requires Augie's explicit yes; never upgrade automatically. This build spends $0 and does not install an external scheduler or send cards.

Apply migration 006, set the secret through the Supabase dashboard, deploy with JWT verification, then enable the app flag on preview. `count=1` measures world/US scorecard/rated totals through four limit=1 requests; record `measured_at` and totals before using listing numbers. No live count or provider validation was performed by this local build.
