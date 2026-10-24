-- GolfCore read-through data only; never merge into an owned/redistributed catalog.
CREATE TABLE IF NOT EXISTS public.course_catalog (
  slug text PRIMARY KEY, source text NOT NULL DEFAULT 'golfcore',
  fetched_at timestamptz NOT NULL DEFAULT now(), payload jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS public.course_search_cache (
  query text PRIMARY KEY, fetched_at timestamptz NOT NULL DEFAULT now(), payload jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS public.golfcore_usage (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  called_at timestamptz NOT NULL DEFAULT now(), month text NOT NULL,
  endpoint text NOT NULL CHECK (endpoint IN ('search','detail','count')),
  status int NOT NULL, is_quota_error boolean NOT NULL DEFAULT false,
  ratelimit_limit int, ratelimit_remaining int, ratelimit_reset text, retry_after text
);
CREATE INDEX IF NOT EXISTS golfcore_usage_month_called_at ON public.golfcore_usage (month, called_at DESC);
CREATE INDEX IF NOT EXISTS golfcore_usage_called_at ON public.golfcore_usage (called_at DESC);
ALTER TABLE public.course_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_search_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.golfcore_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.course_catalog, public.course_search_cache, public.golfcore_usage FROM anon, authenticated;
CREATE OR REPLACE VIEW public.golfcore_usage_summary AS
SELECT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM') AS month,
 count(*)::int AS calls, 500 AS cap, count(*) * 100.0 / 500 AS pct_used,
 CASE WHEN count(*) = 0 THEN 0 ELSE count(*) / greatest(
 extract(epoch FROM (now() - date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')) /
 extract(epoch FROM ((date_trunc('month', now() AT TIME ZONE 'UTC') + interval '1 month') - date_trunc('month', now() AT TIME ZONE 'UTC'))), 0.000000001) END AS projected_month_end,
 count(*) FILTER (WHERE is_quota_error)::int AS quota_errors,
 (SELECT ratelimit_remaining FROM public.golfcore_usage WHERE month = to_char(now() AT TIME ZONE 'UTC','YYYY-MM') AND ratelimit_remaining IS NOT NULL ORDER BY called_at DESC, id DESC LIMIT 1) AS last_remaining,
 max(called_at) AS last_call_at
FROM public.golfcore_usage WHERE month = to_char(now() AT TIME ZONE 'UTC','YYYY-MM');
REVOKE ALL ON public.golfcore_usage_summary FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.golfcore_usage_summary TO service_role;

-- Reserve a ledger row before fetch: advisory lock prevents concurrent overspend.
-- A crashed/failed call conservatively consumes one slot (status 0), never undercounts.
CREATE OR REPLACE FUNCTION public.reserve_golfcore_call(p_endpoint text, p_monthly_cap int, p_minute_cap int)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_month text := to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM');
v_calls int; v_minute int; v_remaining int; v_id bigint;
BEGIN
 PERFORM pg_advisory_xact_lock(706241024);
 SELECT count(*) INTO v_calls FROM golfcore_usage WHERE month = v_month;
 SELECT count(*) INTO v_minute FROM golfcore_usage WHERE called_at >= clock_timestamp() - interval '60 seconds';
 SELECT ratelimit_remaining INTO v_remaining FROM golfcore_usage WHERE month = v_month AND ratelimit_remaining IS NOT NULL ORDER BY called_at DESC, id DESC LIMIT 1;
 -- Hard ceilings regardless of caller-supplied caps (GolfCore Free: 500/month, 10/minute).
 IF v_calls >= LEAST(coalesce(p_monthly_cap, 500), 500) OR v_minute >= LEAST(coalesce(p_minute_cap, 10), 10) OR v_remaining = 0 THEN RETURN NULL; END IF;
 INSERT INTO golfcore_usage(month, endpoint, status) VALUES (v_month, p_endpoint, 0) RETURNING id INTO v_id;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.reserve_golfcore_call(text,int,int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_golfcore_call(text,int,int) TO service_role;
