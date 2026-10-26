-- Additive PM edits. Migration 006 and its v1 summary remain intact.
ALTER TABLE public.golfcore_usage ADD COLUMN IF NOT EXISTS quota_tripped boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS public.golfcore_usage_drift (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 month text NOT NULL, ledger_calls bigint NOT NULL, header_used bigint NOT NULL,
 observed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.golfcore_usage_drift ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.golfcore_usage_drift FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.golfcore_usage_drift TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.golfcore_usage_drift_id_seq TO service_role;

CREATE OR REPLACE VIEW public.golfcore_usage_summary_v2 AS
WITH clock AS (
 SELECT now() AS as_of, to_char(now() AT TIME ZONE 'UTC','YYYY-MM') AS month,
 (date_trunc('month', now() AT TIME ZONE 'UTC') + interval '1 month') AT TIME ZONE 'UTC' AS month_end
), ledger AS (
 SELECT count(*) AS ledger_rows, count(*) FILTER (WHERE is_quota_error) AS quota_errors,
 coalesce(bool_or(quota_tripped), false) AS quota_tripped
 FROM public.golfcore_usage WHERE month = (SELECT month FROM clock)
), recent AS (
 SELECT count(*) AS calls_7d FROM public.golfcore_usage WHERE called_at >= now() - interval '7 days'
), latest AS (
 SELECT greatest(0, ratelimit_limit - ratelimit_remaining) AS header_used
 FROM public.golfcore_usage WHERE month = (SELECT month FROM clock)
 AND ratelimit_limit IS NOT NULL AND ratelimit_remaining IS NOT NULL
 ORDER BY called_at DESC, id DESC LIMIT 1
), effective AS (
 SELECT clock.*, ledger.*, recent.*, greatest(ledger_rows, coalesce((SELECT header_used FROM latest),0)) AS calls_effective
 FROM clock CROSS JOIN ledger CROSS JOIN recent
)
SELECT month, ledger_rows, ledger_rows AS calls, calls_effective, 500 AS cap,
 calls_effective * 100.0 / 500 AS pct_effective, calls_7d,
 calls_effective + (calls_7d / 7.0) * greatest(0, extract(epoch FROM (month_end - as_of)) / 86400.0) AS projected_month_end_7d,
 quota_errors, quota_tripped, as_of FROM effective;
REVOKE ALL ON public.golfcore_usage_summary_v2 FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.golfcore_usage_summary_v2 TO service_role;

CREATE OR REPLACE FUNCTION public.reconcile_golfcore_usage(p_usage_id bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row golfcore_usage%ROWTYPE; v_count bigint; v_used bigint;
BEGIN
 PERFORM pg_advisory_xact_lock(706241024);
 SELECT * INTO v_row FROM golfcore_usage WHERE id = p_usage_id;
 IF v_row.ratelimit_limit IS NULL OR v_row.ratelimit_remaining IS NULL THEN RETURN; END IF;
 SELECT count(*) INTO v_count FROM golfcore_usage WHERE month = v_row.month;
 v_used := greatest(0, v_row.ratelimit_limit - v_row.ratelimit_remaining);
 IF abs(v_used - v_count)::numeric / greatest(1, v_count) > 0.02 THEN
  INSERT INTO golfcore_usage_drift(month, ledger_calls, header_used) VALUES (v_row.month, v_count, v_used);
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.reconcile_golfcore_usage(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_golfcore_usage(bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_golfcore_call(p_endpoint text, p_monthly_cap int, p_minute_cap int)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_month text := to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM');
v_calls bigint; v_minute bigint; v_used bigint; v_tripped boolean; v_id bigint;
BEGIN
 PERFORM pg_advisory_xact_lock(706241024);
 SELECT count(*), coalesce(bool_or(quota_tripped), false) INTO v_calls, v_tripped FROM golfcore_usage WHERE month = v_month;
 SELECT count(*) INTO v_minute FROM golfcore_usage WHERE called_at >= clock_timestamp() - interval '60 seconds';
 SELECT greatest(0, ratelimit_limit - ratelimit_remaining) INTO v_used FROM golfcore_usage
 WHERE month = v_month AND ratelimit_limit IS NOT NULL AND ratelimit_remaining IS NOT NULL ORDER BY called_at DESC, id DESC LIMIT 1;
 IF v_tripped OR greatest(v_calls, coalesce(v_used,0)) >= LEAST(coalesce(p_monthly_cap, 500), 500)
 OR v_minute >= LEAST(coalesce(p_minute_cap, 9), 9) THEN RETURN NULL; END IF;
 INSERT INTO golfcore_usage(month, endpoint, status) VALUES (v_month, p_endpoint, 0) RETURNING id INTO v_id;
 RETURN v_id;
END $$;
