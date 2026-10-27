-- Faithful live baseline, catalog 2026-10-26 20:12 MST. NEVER apply to live.
-- Local empty public schema only. See BASELINE-NOTES.md and ledger adoption README.

SET search_path = public, extensions;
-- Identity ownership/ALWAYS semantics follow archived 006/007; the catalog
-- lists these sequences but information_schema.column_default hides identities.

CREATE TABLE public."automation_log" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "title" text NOT NULL,
  "category" text NOT NULL,
  "details" text,
  "source" text,
  "read" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE public."content_performance" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "notion_page_id" text,
  "title" text NOT NULL,
  "platform" text,
  "published_at" timestamp with time zone,
  "content_type" text,
  "impressions" integer DEFAULT 0,
  "engagements" integer DEFAULT 0,
  "clicks" integer DEFAULT 0,
  "installs_attributed" integer DEFAULT 0,
  "engagement_rate" numeric DEFAULT 0,
  "click_through_rate" numeric DEFAULT 0,
  "install_rate" numeric DEFAULT 0,
  "best_posting_hour" integer,
  "tags" text[],
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE public."contest_players" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "contest_id" uuid NOT NULL,
  "user_id" uuid,
  "group_id" text DEFAULT 'group-1'::text NOT NULL,
  "name" text NOT NULL,
  "handicap" numeric DEFAULT 0,
  "team" text,
  "scores" int4[] DEFAULT ARRAY[]::integer[],
  "putts" int4[] DEFAULT ARRAY[]::integer[],
  "joined_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE public."contests" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" uuid NOT NULL,
  "name" text DEFAULT ''::text NOT NULL,
  "course" jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "bet_unit" numeric DEFAULT 1 NOT NULL,
  "has_teams" boolean DEFAULT false,
  "team_a_name" text,
  "team_b_name" text,
  "games" text[] DEFAULT '{}'::text[] NOT NULL,
  "game_config" jsonb,
  "auxiliary_data" jsonb,
  "invite_code" text NOT NULL,
  "current_hole" integer DEFAULT 1,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE public."course_catalog" (
  "slug" text NOT NULL,
  "source" text DEFAULT 'golfcore'::text NOT NULL,
  "fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
  "payload" jsonb NOT NULL
);

CREATE TABLE public."course_search_cache" (
  "query" text NOT NULL,
  "fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
  "payload" jsonb NOT NULL
);

CREATE TABLE public."daily_metrics" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "date" date DEFAULT CURRENT_DATE NOT NULL,
  "total_users" integer DEFAULT 0,
  "new_users" integer DEFAULT 0,
  "dau" integer DEFAULT 0,
  "mau" integer DEFAULT 0,
  "dau_mau_ratio" numeric DEFAULT 0,
  "total_scans" integer DEFAULT 0,
  "total_settlements" integer DEFAULT 0,
  "revenue_cents" integer DEFAULT 0,
  "k_factor" numeric DEFAULT 0,
  "d7_retention" numeric DEFAULT 0,
  "d30_retention" numeric DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE public."feedback" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "source" text NOT NULL,
  "source_id" text,
  "user_id" uuid,
  "user_email" text,
  "sentiment" text,
  "category" text,
  "subcategory" text,
  "raw_text" text NOT NULL,
  "summary" text,
  "actionable" boolean DEFAULT false,
  "action_taken" text,
  "linear_issue_id" text,
  "priority" integer DEFAULT 3,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE public."funnel_snapshots" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "date" date NOT NULL,
  "app_store_impressions" integer DEFAULT 0,
  "app_store_page_views" integer DEFAULT 0,
  "downloads" integer DEFAULT 0,
  "signups" integer DEFAULT 0,
  "completed_onboarding" integer DEFAULT 0,
  "first_scan_started" integer DEFAULT 0,
  "first_scan_completed" integer DEFAULT 0,
  "first_game_selected" integer DEFAULT 0,
  "first_settlement_sent" integer DEFAULT 0,
  "second_scan_within_7d" integer DEFAULT 0,
  "invited_friend" integer DEFAULT 0,
  "shared_results_card" integer DEFAULT 0,
  "viewed_premium" integer DEFAULT 0,
  "started_trial" integer DEFAULT 0,
  "converted_premium" integer DEFAULT 0,
  "avg_time_to_first_scan_sec" integer,
  "avg_time_to_first_settlement_sec" integer,
  "avg_onboarding_duration_sec" integer,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE public."golfcore_usage" (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "called_at" timestamp with time zone DEFAULT now() NOT NULL,
  "month" text NOT NULL,
  "endpoint" text NOT NULL,
  "status" integer NOT NULL,
  "is_quota_error" boolean DEFAULT false NOT NULL,
  "ratelimit_limit" integer,
  "ratelimit_remaining" integer,
  "ratelimit_reset" text,
  "retry_after" text,
  "quota_tripped" boolean DEFAULT false NOT NULL
);

CREATE TABLE public."golfcore_usage_drift" (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "month" text NOT NULL,
  "ledger_calls" bigint NOT NULL,
  "header_used" bigint NOT NULL,
  "observed_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."improvement_actions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "trigger_type" text NOT NULL,
  "trigger_data" jsonb,
  "diagnosis" text NOT NULL,
  "recommendation" text NOT NULL,
  "impact_area" text,
  "priority" integer DEFAULT 3,
  "status" text DEFAULT 'suggested'::text,
  "linear_issue_id" text,
  "outcome" text,
  "metric_before" numeric,
  "metric_after" numeric,
  "created_at" timestamp with time zone DEFAULT now(),
  "resolved_at" timestamp with time zone
);

CREATE TABLE public."marketing_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "event_name" text NOT NULL,
  "source" text,
  "medium" text,
  "campaign" text,
  "user_id" uuid,
  "properties" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE public."profiles" (
  "id" uuid NOT NULL,
  "email" text,
  "display_name" text,
  "avatar_url" text,
  "is_premium" boolean DEFAULT false,
  "premium_since" timestamp with time zone,
  "premium_source" text,
  "churned_at" timestamp with time zone,
  "signup_source" text,
  "referral_code" text,
  "referred_by" text,
  "referral_count" integer DEFAULT 0,
  "onboarding_email_sent" boolean DEFAULT false,
  "onboarding_email_sent_at" timestamp with time zone,
  "total_scans" integer DEFAULT 0,
  "total_rounds" integer DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE public."published_rounds" (
  "contest_id" uuid NOT NULL,
  "owner_id" uuid NOT NULL,
  "local_id" text NOT NULL,
  "snapshot" jsonb NOT NULL,
  "ended_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."revenue_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "stripe_event_id" text NOT NULL,
  "event_type" text NOT NULL,
  "customer_email" text,
  "amount_cents" integer DEFAULT 0,
  "currency" text DEFAULT 'usd'::text,
  "subscription_id" text,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE public."round_messages" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "contest_id" uuid NOT NULL,
  "display_name" text NOT NULL,
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
  "removed_at" timestamp with time zone,
  "sender_session_hash" text NOT NULL
);

CREATE TABLE public."scans" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid,
  "scorecard_data" jsonb,
  "game_mode" text,
  "players" integer DEFAULT 4,
  "course_name" text,
  "scan_duration_ms" integer,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE public."score_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "contest_id" uuid NOT NULL,
  "player_id" uuid NOT NULL,
  "hole" integer NOT NULL,
  "strokes" integer NOT NULL,
  "entered_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE public."settlements" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "scan_id" uuid,
  "from_user_id" uuid,
  "to_user_id" uuid,
  "amount_cents" integer NOT NULL,
  "status" text DEFAULT 'pending'::text,
  "settled_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE public."share_links" (
  "token_hash" text NOT NULL,
  "contest_id" uuid NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone
);

ALTER TABLE public."automation_log" ADD CONSTRAINT "automation_log_pkey" PRIMARY KEY (id);

ALTER TABLE public."content_performance" ADD CONSTRAINT "content_performance_pkey" PRIMARY KEY (id);

ALTER TABLE public."contest_players" ADD CONSTRAINT "contest_players_contest_id_user_id_key" UNIQUE (contest_id, user_id);

ALTER TABLE public."contest_players" ADD CONSTRAINT "contest_players_pkey" PRIMARY KEY (id);

ALTER TABLE public."contest_players" ADD CONSTRAINT "contest_players_team_check" CHECK ((team = ANY (ARRAY['A'::text, 'B'::text])));

ALTER TABLE public."contests" ADD CONSTRAINT "contests_invite_code_key" UNIQUE (invite_code);

ALTER TABLE public."contests" ADD CONSTRAINT "contests_pkey" PRIMARY KEY (id);

ALTER TABLE public."contests" ADD CONSTRAINT "contests_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text])));

ALTER TABLE public."course_catalog" ADD CONSTRAINT "course_catalog_pkey" PRIMARY KEY (slug);

ALTER TABLE public."course_search_cache" ADD CONSTRAINT "course_search_cache_pkey" PRIMARY KEY (query);

ALTER TABLE public."daily_metrics" ADD CONSTRAINT "daily_metrics_date_key" UNIQUE (date);

ALTER TABLE public."daily_metrics" ADD CONSTRAINT "daily_metrics_pkey" PRIMARY KEY (id);

ALTER TABLE public."feedback" ADD CONSTRAINT "feedback_pkey" PRIMARY KEY (id);

ALTER TABLE public."funnel_snapshots" ADD CONSTRAINT "funnel_snapshots_date_key" UNIQUE (date);

ALTER TABLE public."funnel_snapshots" ADD CONSTRAINT "funnel_snapshots_pkey" PRIMARY KEY (id);

ALTER TABLE public."golfcore_usage" ADD CONSTRAINT "golfcore_usage_endpoint_check" CHECK ((endpoint = ANY (ARRAY['search'::text, 'detail'::text, 'count'::text])));

ALTER TABLE public."golfcore_usage" ADD CONSTRAINT "golfcore_usage_pkey" PRIMARY KEY (id);

ALTER TABLE public."golfcore_usage_drift" ADD CONSTRAINT "golfcore_usage_drift_pkey" PRIMARY KEY (id);

ALTER TABLE public."improvement_actions" ADD CONSTRAINT "improvement_actions_pkey" PRIMARY KEY (id);

ALTER TABLE public."marketing_events" ADD CONSTRAINT "marketing_events_pkey" PRIMARY KEY (id);

ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_pkey" PRIMARY KEY (id);

ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_referral_code_key" UNIQUE (referral_code);

ALTER TABLE public."published_rounds" ADD CONSTRAINT "published_rounds_owner_id_local_id_key" UNIQUE (owner_id, local_id);

ALTER TABLE public."published_rounds" ADD CONSTRAINT "published_rounds_pkey" PRIMARY KEY (contest_id);

ALTER TABLE public."revenue_events" ADD CONSTRAINT "revenue_events_pkey" PRIMARY KEY (id);

ALTER TABLE public."revenue_events" ADD CONSTRAINT "revenue_events_stripe_event_id_key" UNIQUE (stripe_event_id);

ALTER TABLE public."round_messages" ADD CONSTRAINT "round_messages_body_check" CHECK (((char_length(btrim(body)) >= 1) AND (char_length(btrim(body)) <= 500)));

ALTER TABLE public."round_messages" ADD CONSTRAINT "round_messages_display_name_check" CHECK (((char_length(btrim(display_name)) >= 1) AND (char_length(btrim(display_name)) <= 30)));

ALTER TABLE public."round_messages" ADD CONSTRAINT "round_messages_pkey" PRIMARY KEY (id);

ALTER TABLE public."round_messages" ADD CONSTRAINT "round_messages_sender_session_hash_check" CHECK ((sender_session_hash ~ '^[a-f0-9]{64}$'::text));

ALTER TABLE public."scans" ADD CONSTRAINT "scans_pkey" PRIMARY KEY (id);

ALTER TABLE public."score_events" ADD CONSTRAINT "score_events_hole_check" CHECK (((hole >= 1) AND (hole <= 18)));

ALTER TABLE public."score_events" ADD CONSTRAINT "score_events_pkey" PRIMARY KEY (id);

ALTER TABLE public."score_events" ADD CONSTRAINT "score_events_strokes_check" CHECK (((strokes >= 1) AND (strokes <= 15)));

ALTER TABLE public."settlements" ADD CONSTRAINT "settlements_pkey" PRIMARY KEY (id);

ALTER TABLE public."share_links" ADD CONSTRAINT "share_links_pkey" PRIMARY KEY (token_hash);

ALTER TABLE public."contest_players" ADD CONSTRAINT "contest_players_contest_id_fkey" FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE;

ALTER TABLE public."contest_players" ADD CONSTRAINT "contest_players_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public."contests" ADD CONSTRAINT "contests_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id);

ALTER TABLE public."feedback" ADD CONSTRAINT "feedback_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public."marketing_events" ADD CONSTRAINT "marketing_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public."published_rounds" ADD CONSTRAINT "published_rounds_contest_id_fkey" FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE;

ALTER TABLE public."published_rounds" ADD CONSTRAINT "published_rounds_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id);

ALTER TABLE public."round_messages" ADD CONSTRAINT "round_messages_contest_id_fkey" FOREIGN KEY (contest_id) REFERENCES published_rounds(contest_id) ON DELETE CASCADE;

ALTER TABLE public."scans" ADD CONSTRAINT "scans_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE public."score_events" ADD CONSTRAINT "score_events_contest_id_fkey" FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE;

ALTER TABLE public."score_events" ADD CONSTRAINT "score_events_entered_by_fkey" FOREIGN KEY (entered_by) REFERENCES auth.users(id);

ALTER TABLE public."score_events" ADD CONSTRAINT "score_events_player_id_fkey" FOREIGN KEY (player_id) REFERENCES contest_players(id) ON DELETE CASCADE;

ALTER TABLE public."settlements" ADD CONSTRAINT "settlements_from_user_id_fkey" FOREIGN KEY (from_user_id) REFERENCES auth.users(id);

ALTER TABLE public."settlements" ADD CONSTRAINT "settlements_scan_id_fkey" FOREIGN KEY (scan_id) REFERENCES scans(id);

ALTER TABLE public."settlements" ADD CONSTRAINT "settlements_to_user_id_fkey" FOREIGN KEY (to_user_id) REFERENCES auth.users(id);

ALTER TABLE public."share_links" ADD CONSTRAINT "share_links_contest_id_fkey" FOREIGN KEY (contest_id) REFERENCES published_rounds(contest_id) ON DELETE CASCADE;

CREATE INDEX idx_automation_log_category ON public.automation_log USING btree (category);

CREATE INDEX idx_automation_log_created ON public.automation_log USING btree (created_at DESC);

CREATE INDEX idx_automation_log_unread ON public.automation_log USING btree (read) WHERE (read = false);

CREATE INDEX idx_content_perf_engagement ON public.content_performance USING btree (engagement_rate DESC);

CREATE INDEX idx_content_perf_platform ON public.content_performance USING btree (platform);

CREATE INDEX idx_contest_players_contest ON public.contest_players USING btree (contest_id);

CREATE INDEX idx_contest_players_user ON public.contest_players USING btree (user_id);

CREATE INDEX idx_contests_invite_code ON public.contests USING btree (invite_code);

CREATE INDEX idx_contests_owner ON public.contests USING btree (owner_id);

CREATE INDEX idx_feedback_actionable ON public.feedback USING btree (actionable) WHERE (actionable = true);

CREATE INDEX idx_feedback_category ON public.feedback USING btree (category);

CREATE INDEX idx_feedback_created ON public.feedback USING btree (created_at DESC);

CREATE INDEX idx_feedback_sentiment ON public.feedback USING btree (sentiment);

CREATE INDEX idx_feedback_source ON public.feedback USING btree (source);

CREATE INDEX idx_funnel_date ON public.funnel_snapshots USING btree (date DESC);

CREATE INDEX golfcore_usage_called_at ON public.golfcore_usage USING btree (called_at DESC);

CREATE INDEX golfcore_usage_month_called_at ON public.golfcore_usage USING btree (month, called_at DESC);

CREATE INDEX idx_improvements_area ON public.improvement_actions USING btree (impact_area);

CREATE INDEX idx_improvements_created ON public.improvement_actions USING btree (created_at DESC);

CREATE INDEX idx_improvements_status ON public.improvement_actions USING btree (status);

CREATE INDEX idx_marketing_events_campaign ON public.marketing_events USING btree (campaign);

CREATE INDEX idx_marketing_events_created_at ON public.marketing_events USING btree (created_at DESC);

CREATE INDEX idx_marketing_events_source ON public.marketing_events USING btree (source);

CREATE INDEX idx_profiles_email ON public.profiles USING btree (email);

CREATE INDEX idx_profiles_premium ON public.profiles USING btree (is_premium) WHERE (is_premium = true);

CREATE INDEX idx_profiles_referral_code ON public.profiles USING btree (referral_code);

CREATE INDEX idx_revenue_events_created_at ON public.revenue_events USING btree (created_at DESC);

CREATE INDEX idx_revenue_events_customer_email ON public.revenue_events USING btree (customer_email);

CREATE INDEX idx_revenue_events_event_type ON public.revenue_events USING btree (event_type);

CREATE INDEX round_messages_recent ON public.round_messages USING btree (contest_id, created_at DESC);

CREATE INDEX round_messages_session ON public.round_messages USING btree (contest_id, sender_session_hash, created_at DESC);

CREATE INDEX idx_scans_created ON public.scans USING btree (created_at DESC);

CREATE INDEX idx_scans_user ON public.scans USING btree (user_id);

CREATE INDEX idx_score_events_contest ON public.score_events USING btree (contest_id);

CREATE INDEX idx_settlements_created ON public.settlements USING btree (created_at DESC);

CREATE INDEX idx_settlements_from ON public.settlements USING btree (from_user_id);

CREATE INDEX idx_settlements_to ON public.settlements USING btree (to_user_id);

CREATE OR REPLACE FUNCTION public.calculate_retention(days integer)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  eligible integer;
  retained integer;
BEGIN
  SELECT count(*)::integer INTO eligible FROM auth.users WHERE created_at <= now() - (days || ' days')::interval;
  IF eligible = 0 THEN RETURN 0; END IF;
  SELECT count(*)::integer INTO retained FROM auth.users
    WHERE created_at <= now() - (days || ' days')::interval
      AND last_sign_in_at >= now() - (days || ' days')::interval;
  RETURN round((retained::numeric / eligible::numeric) * 100, 2);
END;
$function$;

CREATE OR REPLACE FUNCTION public.chat_contest(p_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare link public.share_links;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'invalid link'; end if;
  select * into link from public.share_links where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
  if not found then raise exception 'invalid link'; end if;
  if link.revoked_at is not null then raise exception 'revoked link'; end if;
  if link.expires_at <= clock_timestamp() then raise exception 'expired link'; end if;
  return link.contest_id;
end $function$;

CREATE OR REPLACE FUNCTION public.create_share_link(p_local_id text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare r public.published_rounds; token text;
begin
  select * into r from public.published_rounds where owner_id=auth.uid() and local_id=p_local_id for update;
  if not found or not exists(select 1 from public.contests where id=r.contest_id and owner_id=auth.uid()) then raise exception 'owner required'; end if;
  if r.ended_at + interval '7 days' <= now() then raise exception 'round expired'; end if;
  token := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  insert into public.share_links(token_hash,contest_id,expires_at)
    values(encode(sha256(convert_to(token,'UTF8')),'hex'),r.contest_id,coalesce(r.ended_at + interval '7 days','infinity'::timestamptz));
  return token;
end $function$;

CREATE OR REPLACE FUNCTION public.get_dau()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN (SELECT count(DISTINCT id)::integer FROM auth.users WHERE last_sign_in_at >= now() - interval '1 day');
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_mau()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN (SELECT count(DISTINCT id)::integer FROM auth.users WHERE last_sign_in_at >= now() - interval '30 days');
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_shared_round(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare link public.share_links; snapshot jsonb;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'invalid link'; end if;
  select * into link from public.share_links where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
  if not found then raise exception 'invalid link'; end if;
  if link.revoked_at is not null then raise exception 'revoked link'; end if;
  if link.expires_at <= now() then raise exception 'expired link'; end if;
  select r.snapshot into snapshot from public.published_rounds r where r.contest_id=link.contest_id;
  return public.sanitize_shared_round(snapshot);
end $function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, signup_source)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_app_meta_data->>'provider', 'email'))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.increment_daily_revenue(target_date date, amount integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.daily_metrics (date, revenue_cents)
  VALUES (target_date, amount)
  ON CONFLICT (date) DO UPDATE SET revenue_cents = daily_metrics.revenue_cents + amount;
END;
$function$;

CREATE OR REPLACE FUNCTION public.increment_daily_signups(target_date date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.daily_metrics (date, new_users)
  VALUES (target_date, 1)
  ON CONFLICT (date) DO UPDATE SET new_users = daily_metrics.new_users + 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_contest_member(p_contest uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  select exists(select 1 from public.contest_players p where p.contest_id = p_contest and p.user_id = auth.uid())
      or exists(select 1 from public.contests c where c.id = p_contest and c.owner_id = auth.uid());
$function$;

CREATE OR REPLACE FUNCTION public.is_contest_owner(p_contest uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  select exists(select 1 from public.contests c where c.id = p_contest and c.owner_id = auth.uid());
$function$;

CREATE OR REPLACE FUNCTION public.list_host_messages(p_local_id text)
 RETURNS TABLE(id uuid, display_name text, body text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare cid uuid;
begin
  select r.contest_id into cid from public.published_rounds r join public.contests c on c.id=r.contest_id
    where r.local_id=p_local_id and r.owner_id=auth.uid() and c.owner_id=auth.uid()
      and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false);
  if cid is null then raise exception 'owner required'; end if;
  return query select m.id,m.display_name,m.body,m.created_at from (
    select r.* from public.round_messages r where r.contest_id=cid and r.removed_at is null
    order by r.created_at desc,r.id desc limit 200
  ) m order by m.created_at,m.id;
end $function$;

CREATE OR REPLACE FUNCTION public.list_messages(p_token text, p_since timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(display_name text, body text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare cid uuid;
begin
  cid := public.chat_contest(p_token);
  return query select m.display_name,m.body,m.created_at from (
    select r.* from public.round_messages r where r.contest_id=cid and r.removed_at is null
      and (p_since is null or r.created_at > p_since)
    order by r.created_at desc,r.id desc limit 200
  ) m order by m.created_at,m.id;
end $function$;

CREATE OR REPLACE FUNCTION public.post_message(p_token text, p_session text, p_name text, p_body text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare cid uuid; session_hash text; at_time timestamptz;
begin
  cid := public.chat_contest(p_token);
  if p_session is null or p_session !~ '^[a-f0-9]{64}$'
    or p_name is null or char_length(btrim(p_name)) not between 1 and 30
    or p_body is null or char_length(btrim(p_body)) not between 1 and 500 then
    raise exception 'invalid message';
  end if;
  -- Same lock as revoke/publish: concurrent posts cannot bypass round/session limits.
  perform 1 from public.published_rounds where contest_id=cid for update;
  perform public.chat_contest(p_token); -- Revocation/expiry may have occurred while waiting.
  at_time := clock_timestamp();
  session_hash := encode(sha256(convert_to(p_session,'UTF8')),'hex');
  -- Removed messages still count. A new token does not reset the round's limits.
  if (select count(*) from public.round_messages where contest_id=cid and sender_session_hash=session_hash
        and created_at > at_time - interval '30 seconds') >= 5
    or (select count(*) from public.round_messages where contest_id=cid
        and created_at > at_time - interval '1 minute') >= 60 then
    raise exception 'chat rate limit' using errcode='P0001';
  end if;
  insert into public.round_messages(contest_id, display_name, body, sender_session_hash, created_at)
    values(cid, btrim(p_name), btrim(p_body), session_hash, at_time);
end $function$;

CREATE OR REPLACE FUNCTION public.publish_shared_round(p_local_id text, p_snapshot jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare r public.published_rounds; cid uuid; clean jsonb; ended timestamptz;
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'owner required'; end if;
  if length(p_local_id) not between 1 and 200 or pg_column_size(p_snapshot) > 100000 then raise exception 'invalid snapshot'; end if;
  -- Serialize creation and updates for a local contest, including across devices.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || p_local_id,0));
  clean := public.sanitize_shared_round(p_snapshot);
  select * into r from public.published_rounds where owner_id = auth.uid() and local_id = p_local_id for update;
  if found then
    cid := r.contest_id;
    if not exists(select 1 from public.contests where id = cid and owner_id = auth.uid()) then raise exception 'owner required'; end if;
    ended := r.ended_at;
  else
    insert into public.contests(owner_id,name,course,invite_code)
      values(auth.uid(),'Shared round','{}'::jsonb,translate(upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)),'01','GH')) returning id into cid;
  end if;
  if (clean->>'completed')::boolean and ended is null then ended := now(); end if;
  insert into public.published_rounds(contest_id,owner_id,local_id,snapshot,ended_at)
    values(cid,auth.uid(),p_local_id,clean,ended)
    on conflict(contest_id) do update set snapshot=excluded.snapshot, ended_at=excluded.ended_at, updated_at=now();
  -- Active links have no scheduled round end. Completion fixes their expiry once.
  if ended is not null then update public.share_links set expires_at=least(expires_at,ended + interval '7 days') where contest_id=cid; end if;
end $function$;

CREATE OR REPLACE FUNCTION public.reconcile_golfcore_usage(p_usage_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$;

CREATE OR REPLACE FUNCTION public.remove_message(p_message_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  update public.round_messages m set removed_at=coalesce(m.removed_at,clock_timestamp())
  where m.id=p_message_id and exists (
    select 1 from public.published_rounds r join public.contests c on c.id=r.contest_id
    where r.contest_id=m.contest_id and r.owner_id=auth.uid() and c.owner_id=auth.uid()
      and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
  );
  if not found then raise exception 'owner required'; end if;
end $function$;

CREATE OR REPLACE FUNCTION public.reserve_golfcore_call(p_endpoint text, p_monthly_cap integer, p_minute_cap integer)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$;

CREATE OR REPLACE FUNCTION public.revoke_share_links(p_local_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare cid uuid;
begin
  select r.contest_id into cid from public.published_rounds r join public.contests c on c.id=r.contest_id
    where r.owner_id=auth.uid() and c.owner_id=auth.uid() and r.local_id=p_local_id for update of r;
  if cid is null then raise exception 'owner required'; end if;
  update public.share_links set revoked_at=now() where contest_id=cid and revoked_at is null;
end $function$;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sanitize_shared_round(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare players jsonb; games jsonb;
begin
  if jsonb_typeof(p->'players') is distinct from 'array' or jsonb_array_length(p->'players') > 40
    or jsonb_typeof(p->'games') is distinct from 'array' or jsonb_array_length(p->'games') > 30 then
    raise exception 'invalid snapshot';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'displayName', left(x->>'displayName',80),
    'scores', (select coalesce(jsonb_agg((n::text)::integer order by ord), '[]'::jsonb)
      from jsonb_array_elements(x->'scores') with ordinality as s(n,ord)
      where ord <= 18 and jsonb_typeof(n) = 'number' and n::text ~ '^[0-9]{1,2}$'),
    'total', (x->>'total')::integer, 'toPar', (x->>'toPar')::integer
  )), '[]'::jsonb) into players from jsonb_array_elements(p->'players') x;
  select coalesce(jsonb_agg(jsonb_build_object(
    'game', left(x->>'game',40),
    'standings', (select coalesce(jsonb_agg(jsonb_build_object(
      'displayName', left(s->>'displayName',80), 'units', (s->>'units')::numeric)), '[]'::jsonb)
      from jsonb_array_elements(x->'standings') s)
  )), '[]'::jsonb) into games from jsonb_array_elements(p->'games') x;
  return jsonb_build_object('completed', coalesce((p->>'completed')::boolean,false), 'players', players, 'games', games);
end $function$;

CREATE VIEW public."channel_effectiveness" AS  SELECT source,
    count(*) AS total_signups,
    count(*) FILTER (WHERE (user_id IN ( SELECT profiles.id
           FROM profiles
          WHERE (profiles.is_premium = true)))) AS premium_conversions,
    round((((count(*) FILTER (WHERE (user_id IN ( SELECT profiles.id
           FROM profiles
          WHERE (profiles.is_premium = true)))))::numeric / (NULLIF(count(*), 0))::numeric) * (100)::numeric), 2) AS premium_conversion_rate
   FROM marketing_events
  WHERE ((event_name = 'user_signup'::text) AND (created_at >= (now() - '30 days'::interval)))
  GROUP BY source
  ORDER BY (count(*)) DESC;

CREATE VIEW public."content_insights" AS  SELECT platform,
    content_type,
    count(*) AS total_posts,
    round((avg(engagement_rate) * (100)::numeric), 2) AS avg_engagement_pct,
    round((avg(click_through_rate) * (100)::numeric), 2) AS avg_ctr_pct,
    sum(installs_attributed) AS total_installs,
    mode() WITHIN GROUP (ORDER BY best_posting_hour) AS optimal_hour
   FROM content_performance
  WHERE (published_at >= (now() - '30 days'::interval))
  GROUP BY platform, content_type
  ORDER BY (round((avg(engagement_rate) * (100)::numeric), 2)) DESC;

CREATE VIEW public."feedback_themes" AS  SELECT category,
    subcategory,
    sentiment,
    count(*) AS mention_count,
    count(*) FILTER (WHERE (created_at >= (now() - '7 days'::interval))) AS mentions_7d,
    count(*) FILTER (WHERE (created_at >= (now() - '1 day'::interval))) AS mentions_24h,
    count(*) FILTER (WHERE ((actionable = true) AND (action_taken IS NULL))) AS unactioned,
    round((((count(*) FILTER (WHERE (sentiment = 'negative'::text)))::numeric / (NULLIF(count(*), 0))::numeric) * (100)::numeric), 1) AS negative_pct
   FROM feedback
  WHERE (created_at >= (now() - '30 days'::interval))
  GROUP BY category, subcategory, sentiment
  ORDER BY (count(*)) DESC;

CREATE VIEW public."funnel_health" AS  WITH this_week AS (
         SELECT avg(
                CASE
                    WHEN (funnel_snapshots.downloads > 0) THEN ((funnel_snapshots.signups)::numeric / (funnel_snapshots.downloads)::numeric)
                    ELSE NULL::numeric
                END) AS signup_rate,
            avg(
                CASE
                    WHEN (funnel_snapshots.signups > 0) THEN ((funnel_snapshots.first_scan_completed)::numeric / (funnel_snapshots.signups)::numeric)
                    ELSE NULL::numeric
                END) AS activation_rate,
            avg(
                CASE
                    WHEN (funnel_snapshots.first_scan_completed > 0) THEN ((funnel_snapshots.first_settlement_sent)::numeric / (funnel_snapshots.first_scan_completed)::numeric)
                    ELSE NULL::numeric
                END) AS settlement_rate,
            avg(
                CASE
                    WHEN (funnel_snapshots.first_scan_completed > 0) THEN ((funnel_snapshots.second_scan_within_7d)::numeric / (funnel_snapshots.first_scan_completed)::numeric)
                    ELSE NULL::numeric
                END) AS retention_rate,
            avg(
                CASE
                    WHEN (funnel_snapshots.first_scan_completed > 0) THEN ((funnel_snapshots.invited_friend)::numeric / (funnel_snapshots.first_scan_completed)::numeric)
                    ELSE NULL::numeric
                END) AS invite_rate,
            avg(
                CASE
                    WHEN (funnel_snapshots.signups > 0) THEN ((funnel_snapshots.converted_premium)::numeric / (funnel_snapshots.signups)::numeric)
                    ELSE NULL::numeric
                END) AS premium_rate,
            avg(funnel_snapshots.avg_time_to_first_scan_sec) AS avg_ttfs
           FROM funnel_snapshots
          WHERE (funnel_snapshots.date >= (CURRENT_DATE - 7))
        ), last_week AS (
         SELECT avg(
                CASE
                    WHEN (funnel_snapshots.downloads > 0) THEN ((funnel_snapshots.signups)::numeric / (funnel_snapshots.downloads)::numeric)
                    ELSE NULL::numeric
                END) AS signup_rate,
            avg(
                CASE
                    WHEN (funnel_snapshots.signups > 0) THEN ((funnel_snapshots.first_scan_completed)::numeric / (funnel_snapshots.signups)::numeric)
                    ELSE NULL::numeric
                END) AS activation_rate,
            avg(
                CASE
                    WHEN (funnel_snapshots.first_scan_completed > 0) THEN ((funnel_snapshots.first_settlement_sent)::numeric / (funnel_snapshots.first_scan_completed)::numeric)
                    ELSE NULL::numeric
                END) AS settlement_rate,
            avg(
                CASE
                    WHEN (funnel_snapshots.first_scan_completed > 0) THEN ((funnel_snapshots.second_scan_within_7d)::numeric / (funnel_snapshots.first_scan_completed)::numeric)
                    ELSE NULL::numeric
                END) AS retention_rate,
            avg(
                CASE
                    WHEN (funnel_snapshots.first_scan_completed > 0) THEN ((funnel_snapshots.invited_friend)::numeric / (funnel_snapshots.first_scan_completed)::numeric)
                    ELSE NULL::numeric
                END) AS invite_rate,
            avg(
                CASE
                    WHEN (funnel_snapshots.signups > 0) THEN ((funnel_snapshots.converted_premium)::numeric / (funnel_snapshots.signups)::numeric)
                    ELSE NULL::numeric
                END) AS premium_rate,
            avg(funnel_snapshots.avg_time_to_first_scan_sec) AS avg_ttfs
           FROM funnel_snapshots
          WHERE ((funnel_snapshots.date >= (CURRENT_DATE - 14)) AND (funnel_snapshots.date < (CURRENT_DATE - 7)))
        )
 SELECT round((tw.signup_rate * (100)::numeric), 1) AS signup_rate_pct,
    round((tw.activation_rate * (100)::numeric), 1) AS activation_rate_pct,
    round((tw.settlement_rate * (100)::numeric), 1) AS settlement_rate_pct,
    round((tw.retention_rate * (100)::numeric), 1) AS retention_rate_pct,
    round((tw.invite_rate * (100)::numeric), 1) AS invite_rate_pct,
    round((tw.premium_rate * (100)::numeric), 1) AS premium_rate_pct,
    round(tw.avg_ttfs) AS avg_ttfs_sec,
    round(((tw.activation_rate - lw.activation_rate) * (100)::numeric), 1) AS activation_wow_delta,
    round(((tw.settlement_rate - lw.settlement_rate) * (100)::numeric), 1) AS settlement_wow_delta,
    round(((tw.invite_rate - lw.invite_rate) * (100)::numeric), 1) AS invite_wow_delta
   FROM this_week tw,
    last_week lw;

CREATE VIEW public."golfcore_usage_summary" AS  SELECT to_char((now() AT TIME ZONE 'UTC'::text), 'YYYY-MM'::text) AS month,
    (count(*))::integer AS calls,
    500 AS cap,
    (((count(*))::numeric * 100.0) / (500)::numeric) AS pct_used,
        CASE
            WHEN (count(*) = 0) THEN (0)::numeric
            ELSE ((count(*))::numeric / GREATEST((EXTRACT(epoch FROM (now() - (date_trunc('month'::text, (now() AT TIME ZONE 'UTC'::text)) AT TIME ZONE 'UTC'::text))) / EXTRACT(epoch FROM ((date_trunc('month'::text, (now() AT TIME ZONE 'UTC'::text)) + '1 mon'::interval) - date_trunc('month'::text, (now() AT TIME ZONE 'UTC'::text))))), 0.000000001))
        END AS projected_month_end,
    (count(*) FILTER (WHERE is_quota_error))::integer AS quota_errors,
    ( SELECT golfcore_usage_1.ratelimit_remaining
           FROM golfcore_usage golfcore_usage_1
          WHERE ((golfcore_usage_1.month = to_char((now() AT TIME ZONE 'UTC'::text), 'YYYY-MM'::text)) AND (golfcore_usage_1.ratelimit_remaining IS NOT NULL))
          ORDER BY golfcore_usage_1.called_at DESC, golfcore_usage_1.id DESC
         LIMIT 1) AS last_remaining,
    max(called_at) AS last_call_at
   FROM golfcore_usage
  WHERE (month = to_char((now() AT TIME ZONE 'UTC'::text), 'YYYY-MM'::text));

CREATE VIEW public."golfcore_usage_summary_v2" AS  WITH clock AS (
         SELECT now() AS as_of,
            to_char((now() AT TIME ZONE 'UTC'::text), 'YYYY-MM'::text) AS month,
            ((date_trunc('month'::text, (now() AT TIME ZONE 'UTC'::text)) + '1 mon'::interval) AT TIME ZONE 'UTC'::text) AS month_end
        ), ledger AS (
         SELECT count(*) AS ledger_rows,
            count(*) FILTER (WHERE golfcore_usage.is_quota_error) AS quota_errors,
            COALESCE(bool_or(golfcore_usage.quota_tripped), false) AS quota_tripped
           FROM golfcore_usage
          WHERE (golfcore_usage.month = ( SELECT clock.month
                   FROM clock))
        ), recent AS (
         SELECT count(*) AS calls_7d
           FROM golfcore_usage
          WHERE (golfcore_usage.called_at >= (now() - '7 days'::interval))
        ), latest AS (
         SELECT GREATEST(0, (golfcore_usage.ratelimit_limit - golfcore_usage.ratelimit_remaining)) AS header_used
           FROM golfcore_usage
          WHERE ((golfcore_usage.month = ( SELECT clock.month
                   FROM clock)) AND (golfcore_usage.ratelimit_limit IS NOT NULL) AND (golfcore_usage.ratelimit_remaining IS NOT NULL))
          ORDER BY golfcore_usage.called_at DESC, golfcore_usage.id DESC
         LIMIT 1
        ), effective AS (
         SELECT clock.as_of,
            clock.month,
            clock.month_end,
            ledger.ledger_rows,
            ledger.quota_errors,
            ledger.quota_tripped,
            recent.calls_7d,
            GREATEST(ledger.ledger_rows, (COALESCE(( SELECT latest.header_used
                   FROM latest), 0))::bigint) AS calls_effective
           FROM ((clock
             CROSS JOIN ledger)
             CROSS JOIN recent)
        )
 SELECT month,
    ledger_rows,
    ledger_rows AS calls,
    calls_effective,
    500 AS cap,
    (((calls_effective)::numeric * 100.0) / (500)::numeric) AS pct_effective,
    calls_7d,
    ((calls_effective)::numeric + (((calls_7d)::numeric / 7.0) * GREATEST((0)::numeric, (EXTRACT(epoch FROM (month_end - as_of)) / 86400.0)))) AS projected_month_end_7d,
    quota_errors,
    quota_tripped,
    as_of
   FROM effective;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE TRIGGER contests_updated_at BEFORE UPDATE ON public.contests FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

ALTER TABLE public."automation_log" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."automation_log" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE public."content_performance" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."content_performance" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE public."contest_players" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."contest_players" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE public."contests" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."contests" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE public."course_catalog" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."course_catalog" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE public."course_search_cache" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."course_search_cache" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE public."daily_metrics" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."daily_metrics" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE public."feedback" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."feedback" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE public."funnel_snapshots" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."funnel_snapshots" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE public."golfcore_usage" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."golfcore_usage" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE public."golfcore_usage_drift" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."golfcore_usage_drift" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE public."improvement_actions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."improvement_actions" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE public."marketing_events" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."marketing_events" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE public."profiles" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."profiles" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE public."published_rounds" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."published_rounds" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE public."revenue_events" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."revenue_events" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE public."round_messages" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."round_messages" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE public."scans" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."scans" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE public."score_events" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."score_events" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE public."settlements" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."settlements" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE public."share_links" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."share_links" NO FORCE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on automation_log" ON public."automation_log" AS PERMISSIVE FOR ALL TO "public" USING ((auth.role() = 'service_role'::text));

CREATE POLICY "Service role full access on content_performance" ON public."content_performance" AS PERMISSIVE FOR ALL TO "public" USING ((auth.role() = 'service_role'::text));

CREATE POLICY "Owner can insert players" ON public."contest_players" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (is_contest_owner(contest_id));

CREATE POLICY "Participants can view players" ON public."contest_players" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_contest_member(contest_id));

CREATE POLICY "Self or owner can update" ON public."contest_players" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((user_id = auth.uid()) OR is_contest_owner(contest_id))) WITH CHECK (((user_id = auth.uid()) OR is_contest_owner(contest_id)));

CREATE POLICY "Users can join contests" ON public."contest_players" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "Owner full access" ON public."contests" AS PERMISSIVE FOR ALL TO "authenticated" USING ((owner_id = auth.uid())) WITH CHECK ((owner_id = auth.uid()));

CREATE POLICY "Participants can view contests" ON public."contests" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_contest_member(id));

CREATE POLICY "Service role full access on daily_metrics" ON public."daily_metrics" AS PERMISSIVE FOR ALL TO "public" USING ((auth.role() = 'service_role'::text));

CREATE POLICY "Service role full access on feedback" ON public."feedback" AS PERMISSIVE FOR ALL TO "public" USING ((auth.role() = 'service_role'::text));

CREATE POLICY "Service role full access on funnel_snapshots" ON public."funnel_snapshots" AS PERMISSIVE FOR ALL TO "public" USING ((auth.role() = 'service_role'::text));

CREATE POLICY "Service role full access on improvement_actions" ON public."improvement_actions" AS PERMISSIVE FOR ALL TO "public" USING ((auth.role() = 'service_role'::text));

CREATE POLICY "Service role full access on marketing_events" ON public."marketing_events" AS PERMISSIVE FOR ALL TO "public" USING ((auth.role() = 'service_role'::text));

CREATE POLICY "Users can view own marketing events" ON public."marketing_events" AS PERMISSIVE FOR SELECT TO "public" USING ((auth.uid() = user_id));

CREATE POLICY "Service role full access on profiles" ON public."profiles" AS PERMISSIVE FOR ALL TO "public" USING ((auth.role() = 'service_role'::text));

CREATE POLICY "Users can update own profile" ON public."profiles" AS PERMISSIVE FOR UPDATE TO "public" USING ((auth.uid() = id));

CREATE POLICY "Users can view own profile" ON public."profiles" AS PERMISSIVE FOR SELECT TO "public" USING ((auth.uid() = id));

CREATE POLICY "Service role full access on revenue_events" ON public."revenue_events" AS PERMISSIVE FOR ALL TO "public" USING ((auth.role() = 'service_role'::text));

CREATE POLICY "Service role full access on scans" ON public."scans" AS PERMISSIVE FOR ALL TO "public" USING ((auth.role() = 'service_role'::text));

CREATE POLICY "Users can create scans" ON public."scans" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can view own scans" ON public."scans" AS PERMISSIVE FOR SELECT TO "public" USING ((auth.uid() = user_id));

CREATE POLICY "Participants can insert scores" ON public."score_events" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((is_contest_member(contest_id) AND (entered_by = auth.uid())));

CREATE POLICY "Participants can view scores" ON public."score_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_contest_member(contest_id));

CREATE POLICY "Service role full access on settlements" ON public."settlements" AS PERMISSIVE FOR ALL TO "public" USING ((auth.role() = 'service_role'::text));

CREATE POLICY "Users can view own settlements" ON public."settlements" AS PERMISSIVE FOR SELECT TO "public" USING (((auth.uid() = from_user_id) OR (auth.uid() = to_user_id)));

ALTER TABLE public."automation_log" OWNER TO postgres;

REVOKE ALL ON TABLE public."automation_log" FROM PUBLIC, anon, authenticated, service_role;

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."automation_log" TO "postgres";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."automation_log" TO "anon";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."automation_log" TO "authenticated";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."automation_log" TO "service_role";

ALTER TABLE public."channel_effectiveness" OWNER TO postgres;

REVOKE ALL ON TABLE public."channel_effectiveness" FROM PUBLIC, anon, authenticated, service_role;

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."channel_effectiveness" TO "postgres";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."channel_effectiveness" TO "anon";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."channel_effectiveness" TO "authenticated";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."channel_effectiveness" TO "service_role";

ALTER TABLE public."content_insights" OWNER TO postgres;

REVOKE ALL ON TABLE public."content_insights" FROM PUBLIC, anon, authenticated, service_role;

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."content_insights" TO "postgres";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."content_insights" TO "anon";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."content_insights" TO "authenticated";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."content_insights" TO "service_role";

ALTER TABLE public."content_performance" OWNER TO postgres;

REVOKE ALL ON TABLE public."content_performance" FROM PUBLIC, anon, authenticated, service_role;

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."content_performance" TO "postgres";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."content_performance" TO "anon";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."content_performance" TO "authenticated";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."content_performance" TO "service_role";

ALTER TABLE public."contest_players" OWNER TO postgres;

REVOKE ALL ON TABLE public."contest_players" FROM PUBLIC, anon, authenticated, service_role;

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."contest_players" TO "postgres";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."contest_players" TO "anon";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."contest_players" TO "authenticated";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."contest_players" TO "service_role";

ALTER TABLE public."contests" OWNER TO postgres;

REVOKE ALL ON TABLE public."contests" FROM PUBLIC, anon, authenticated, service_role;

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."contests" TO "postgres";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."contests" TO "anon";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."contests" TO "authenticated";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."contests" TO "service_role";

ALTER TABLE public."course_catalog" OWNER TO postgres;

REVOKE ALL ON TABLE public."course_catalog" FROM PUBLIC, anon, authenticated, service_role;

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."course_catalog" TO "postgres";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."course_catalog" TO "service_role";

ALTER TABLE public."course_search_cache" OWNER TO postgres;

REVOKE ALL ON TABLE public."course_search_cache" FROM PUBLIC, anon, authenticated, service_role;

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."course_search_cache" TO "postgres";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."course_search_cache" TO "service_role";

ALTER TABLE public."daily_metrics" OWNER TO postgres;

REVOKE ALL ON TABLE public."daily_metrics" FROM PUBLIC, anon, authenticated, service_role;

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."daily_metrics" TO "postgres";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."daily_metrics" TO "anon";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."daily_metrics" TO "authenticated";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."daily_metrics" TO "service_role";

ALTER TABLE public."feedback" OWNER TO postgres;

REVOKE ALL ON TABLE public."feedback" FROM PUBLIC, anon, authenticated, service_role;

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."feedback" TO "postgres";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."feedback" TO "anon";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."feedback" TO "authenticated";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."feedback" TO "service_role";

ALTER TABLE public."feedback_themes" OWNER TO postgres;

REVOKE ALL ON TABLE public."feedback_themes" FROM PUBLIC, anon, authenticated, service_role;

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."feedback_themes" TO "postgres";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."feedback_themes" TO "anon";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."feedback_themes" TO "authenticated";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."feedback_themes" TO "service_role";

ALTER TABLE public."funnel_health" OWNER TO postgres;

REVOKE ALL ON TABLE public."funnel_health" FROM PUBLIC, anon, authenticated, service_role;

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."funnel_health" TO "postgres";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."funnel_health" TO "anon";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."funnel_health" TO "authenticated";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."funnel_health" TO "service_role";

ALTER TABLE public."funnel_snapshots" OWNER TO postgres;

REVOKE ALL ON TABLE public."funnel_snapshots" FROM PUBLIC, anon, authenticated, service_role;

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."funnel_snapshots" TO "postgres";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."funnel_snapshots" TO "anon";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."funnel_snapshots" TO "authenticated";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."funnel_snapshots" TO "service_role";

ALTER TABLE public."golfcore_usage" OWNER TO postgres;

REVOKE ALL ON TABLE public."golfcore_usage" FROM PUBLIC, anon, authenticated, service_role;

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."golfcore_usage" TO "postgres";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."golfcore_usage" TO "service_role";

ALTER TABLE public."golfcore_usage_drift" OWNER TO postgres;

REVOKE ALL ON TABLE public."golfcore_usage_drift" FROM PUBLIC, anon, authenticated, service_role;

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."golfcore_usage_drift" TO "postgres";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."golfcore_usage_drift" TO "service_role";

ALTER SEQUENCE public."golfcore_usage_drift_id_seq" OWNER TO postgres;

REVOKE ALL ON SEQUENCE public."golfcore_usage_drift_id_seq" FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."golfcore_usage_drift_id_seq" TO "postgres";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."golfcore_usage_drift_id_seq" TO "anon";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."golfcore_usage_drift_id_seq" TO "authenticated";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."golfcore_usage_drift_id_seq" TO "service_role";

ALTER SEQUENCE public."golfcore_usage_id_seq" OWNER TO postgres;

REVOKE ALL ON SEQUENCE public."golfcore_usage_id_seq" FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."golfcore_usage_id_seq" TO "postgres";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."golfcore_usage_id_seq" TO "anon";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."golfcore_usage_id_seq" TO "authenticated";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE public."golfcore_usage_id_seq" TO "service_role";

ALTER TABLE public."golfcore_usage_summary" OWNER TO postgres;

REVOKE ALL ON TABLE public."golfcore_usage_summary" FROM PUBLIC, anon, authenticated, service_role;

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."golfcore_usage_summary" TO "postgres";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."golfcore_usage_summary" TO "service_role";

ALTER TABLE public."golfcore_usage_summary_v2" OWNER TO postgres;

REVOKE ALL ON TABLE public."golfcore_usage_summary_v2" FROM PUBLIC, anon, authenticated, service_role;

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."golfcore_usage_summary_v2" TO "postgres";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."golfcore_usage_summary_v2" TO "service_role";

ALTER TABLE public."improvement_actions" OWNER TO postgres;

REVOKE ALL ON TABLE public."improvement_actions" FROM PUBLIC, anon, authenticated, service_role;

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."improvement_actions" TO "postgres";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."improvement_actions" TO "anon";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."improvement_actions" TO "authenticated";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."improvement_actions" TO "service_role";

ALTER TABLE public."marketing_events" OWNER TO postgres;

REVOKE ALL ON TABLE public."marketing_events" FROM PUBLIC, anon, authenticated, service_role;

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."marketing_events" TO "postgres";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."marketing_events" TO "anon";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."marketing_events" TO "authenticated";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."marketing_events" TO "service_role";

ALTER TABLE public."profiles" OWNER TO postgres;

REVOKE ALL ON TABLE public."profiles" FROM PUBLIC, anon, authenticated, service_role;

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."profiles" TO "postgres";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."profiles" TO "anon";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."profiles" TO "authenticated";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."profiles" TO "service_role";

ALTER TABLE public."published_rounds" OWNER TO postgres;

REVOKE ALL ON TABLE public."published_rounds" FROM PUBLIC, anon, authenticated, service_role;

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."published_rounds" TO "postgres";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."published_rounds" TO "service_role";

ALTER TABLE public."revenue_events" OWNER TO postgres;

REVOKE ALL ON TABLE public."revenue_events" FROM PUBLIC, anon, authenticated, service_role;

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."revenue_events" TO "postgres";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."revenue_events" TO "anon";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."revenue_events" TO "authenticated";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."revenue_events" TO "service_role";

ALTER TABLE public."round_messages" OWNER TO postgres;

REVOKE ALL ON TABLE public."round_messages" FROM PUBLIC, anon, authenticated, service_role;

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."round_messages" TO "postgres";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."round_messages" TO "service_role";

ALTER TABLE public."scans" OWNER TO postgres;

REVOKE ALL ON TABLE public."scans" FROM PUBLIC, anon, authenticated, service_role;

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."scans" TO "postgres";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."scans" TO "anon";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."scans" TO "authenticated";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."scans" TO "service_role";

ALTER TABLE public."score_events" OWNER TO postgres;

REVOKE ALL ON TABLE public."score_events" FROM PUBLIC, anon, authenticated, service_role;

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."score_events" TO "postgres";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."score_events" TO "anon";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."score_events" TO "authenticated";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."score_events" TO "service_role";

ALTER TABLE public."settlements" OWNER TO postgres;

REVOKE ALL ON TABLE public."settlements" FROM PUBLIC, anon, authenticated, service_role;

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."settlements" TO "postgres";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."settlements" TO "anon";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."settlements" TO "authenticated";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."settlements" TO "service_role";

ALTER TABLE public."share_links" OWNER TO postgres;

REVOKE ALL ON TABLE public."share_links" FROM PUBLIC, anon, authenticated, service_role;

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."share_links" TO "postgres";

GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public."share_links" TO "service_role";

ALTER FUNCTION public."calculate_retention"(days integer) OWNER TO postgres;

REVOKE ALL ON FUNCTION public."calculate_retention"(days integer) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."calculate_retention"(days integer) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public."calculate_retention"(days integer) TO "postgres";

GRANT EXECUTE ON FUNCTION public."calculate_retention"(days integer) TO "anon";

GRANT EXECUTE ON FUNCTION public."calculate_retention"(days integer) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."calculate_retention"(days integer) TO "service_role";

ALTER FUNCTION public."chat_contest"(p_token text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public."chat_contest"(p_token text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."chat_contest"(p_token text) TO "postgres";

GRANT EXECUTE ON FUNCTION public."chat_contest"(p_token text) TO "service_role";

ALTER FUNCTION public."create_share_link"(p_local_id text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public."create_share_link"(p_local_id text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."create_share_link"(p_local_id text) TO "postgres";

GRANT EXECUTE ON FUNCTION public."create_share_link"(p_local_id text) TO "service_role";

GRANT EXECUTE ON FUNCTION public."create_share_link"(p_local_id text) TO "authenticated";

ALTER FUNCTION public."get_dau"() OWNER TO postgres;

REVOKE ALL ON FUNCTION public."get_dau"() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."get_dau"() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public."get_dau"() TO "postgres";

GRANT EXECUTE ON FUNCTION public."get_dau"() TO "anon";

GRANT EXECUTE ON FUNCTION public."get_dau"() TO "authenticated";

GRANT EXECUTE ON FUNCTION public."get_dau"() TO "service_role";

ALTER FUNCTION public."get_mau"() OWNER TO postgres;

REVOKE ALL ON FUNCTION public."get_mau"() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."get_mau"() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public."get_mau"() TO "postgres";

GRANT EXECUTE ON FUNCTION public."get_mau"() TO "anon";

GRANT EXECUTE ON FUNCTION public."get_mau"() TO "authenticated";

GRANT EXECUTE ON FUNCTION public."get_mau"() TO "service_role";

ALTER FUNCTION public."get_shared_round"(p_token text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public."get_shared_round"(p_token text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."get_shared_round"(p_token text) TO "postgres";

GRANT EXECUTE ON FUNCTION public."get_shared_round"(p_token text) TO "service_role";

GRANT EXECUTE ON FUNCTION public."get_shared_round"(p_token text) TO "anon";

GRANT EXECUTE ON FUNCTION public."get_shared_round"(p_token text) TO "authenticated";

ALTER FUNCTION public."handle_new_user"() OWNER TO postgres;

REVOKE ALL ON FUNCTION public."handle_new_user"() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."handle_new_user"() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public."handle_new_user"() TO "postgres";

GRANT EXECUTE ON FUNCTION public."handle_new_user"() TO "anon";

GRANT EXECUTE ON FUNCTION public."handle_new_user"() TO "authenticated";

GRANT EXECUTE ON FUNCTION public."handle_new_user"() TO "service_role";

ALTER FUNCTION public."handle_updated_at"() OWNER TO postgres;

REVOKE ALL ON FUNCTION public."handle_updated_at"() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."handle_updated_at"() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public."handle_updated_at"() TO "postgres";

GRANT EXECUTE ON FUNCTION public."handle_updated_at"() TO "anon";

GRANT EXECUTE ON FUNCTION public."handle_updated_at"() TO "authenticated";

GRANT EXECUTE ON FUNCTION public."handle_updated_at"() TO "service_role";

ALTER FUNCTION public."increment_daily_revenue"(target_date date, amount integer) OWNER TO postgres;

REVOKE ALL ON FUNCTION public."increment_daily_revenue"(target_date date, amount integer) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."increment_daily_revenue"(target_date date, amount integer) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public."increment_daily_revenue"(target_date date, amount integer) TO "postgres";

GRANT EXECUTE ON FUNCTION public."increment_daily_revenue"(target_date date, amount integer) TO "anon";

GRANT EXECUTE ON FUNCTION public."increment_daily_revenue"(target_date date, amount integer) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."increment_daily_revenue"(target_date date, amount integer) TO "service_role";

ALTER FUNCTION public."increment_daily_signups"(target_date date) OWNER TO postgres;

REVOKE ALL ON FUNCTION public."increment_daily_signups"(target_date date) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."increment_daily_signups"(target_date date) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public."increment_daily_signups"(target_date date) TO "postgres";

GRANT EXECUTE ON FUNCTION public."increment_daily_signups"(target_date date) TO "anon";

GRANT EXECUTE ON FUNCTION public."increment_daily_signups"(target_date date) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."increment_daily_signups"(target_date date) TO "service_role";

ALTER FUNCTION public."is_contest_member"(p_contest uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public."is_contest_member"(p_contest uuid) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."is_contest_member"(p_contest uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION public."is_contest_member"(p_contest uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."is_contest_member"(p_contest uuid) TO "service_role";

ALTER FUNCTION public."is_contest_owner"(p_contest uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public."is_contest_owner"(p_contest uuid) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."is_contest_owner"(p_contest uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION public."is_contest_owner"(p_contest uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION public."is_contest_owner"(p_contest uuid) TO "service_role";

ALTER FUNCTION public."list_host_messages"(p_local_id text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public."list_host_messages"(p_local_id text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."list_host_messages"(p_local_id text) TO "postgres";

GRANT EXECUTE ON FUNCTION public."list_host_messages"(p_local_id text) TO "service_role";

GRANT EXECUTE ON FUNCTION public."list_host_messages"(p_local_id text) TO "authenticated";

ALTER FUNCTION public."list_messages"(p_token text, p_since timestamp with time zone) OWNER TO postgres;

REVOKE ALL ON FUNCTION public."list_messages"(p_token text, p_since timestamp with time zone) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."list_messages"(p_token text, p_since timestamp with time zone) TO "postgres";

GRANT EXECUTE ON FUNCTION public."list_messages"(p_token text, p_since timestamp with time zone) TO "service_role";

GRANT EXECUTE ON FUNCTION public."list_messages"(p_token text, p_since timestamp with time zone) TO "anon";

GRANT EXECUTE ON FUNCTION public."list_messages"(p_token text, p_since timestamp with time zone) TO "authenticated";

ALTER FUNCTION public."post_message"(p_token text, p_session text, p_name text, p_body text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public."post_message"(p_token text, p_session text, p_name text, p_body text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."post_message"(p_token text, p_session text, p_name text, p_body text) TO "postgres";

GRANT EXECUTE ON FUNCTION public."post_message"(p_token text, p_session text, p_name text, p_body text) TO "service_role";

GRANT EXECUTE ON FUNCTION public."post_message"(p_token text, p_session text, p_name text, p_body text) TO "anon";

GRANT EXECUTE ON FUNCTION public."post_message"(p_token text, p_session text, p_name text, p_body text) TO "authenticated";

ALTER FUNCTION public."publish_shared_round"(p_local_id text, p_snapshot jsonb) OWNER TO postgres;

REVOKE ALL ON FUNCTION public."publish_shared_round"(p_local_id text, p_snapshot jsonb) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."publish_shared_round"(p_local_id text, p_snapshot jsonb) TO "postgres";

GRANT EXECUTE ON FUNCTION public."publish_shared_round"(p_local_id text, p_snapshot jsonb) TO "service_role";

GRANT EXECUTE ON FUNCTION public."publish_shared_round"(p_local_id text, p_snapshot jsonb) TO "authenticated";

ALTER FUNCTION public."reconcile_golfcore_usage"(p_usage_id bigint) OWNER TO postgres;

REVOKE ALL ON FUNCTION public."reconcile_golfcore_usage"(p_usage_id bigint) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."reconcile_golfcore_usage"(p_usage_id bigint) TO "postgres";

GRANT EXECUTE ON FUNCTION public."reconcile_golfcore_usage"(p_usage_id bigint) TO "service_role";

ALTER FUNCTION public."remove_message"(p_message_id uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public."remove_message"(p_message_id uuid) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."remove_message"(p_message_id uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION public."remove_message"(p_message_id uuid) TO "service_role";

GRANT EXECUTE ON FUNCTION public."remove_message"(p_message_id uuid) TO "authenticated";

ALTER FUNCTION public."reserve_golfcore_call"(p_endpoint text, p_monthly_cap integer, p_minute_cap integer) OWNER TO postgres;

REVOKE ALL ON FUNCTION public."reserve_golfcore_call"(p_endpoint text, p_monthly_cap integer, p_minute_cap integer) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."reserve_golfcore_call"(p_endpoint text, p_monthly_cap integer, p_minute_cap integer) TO "postgres";

GRANT EXECUTE ON FUNCTION public."reserve_golfcore_call"(p_endpoint text, p_monthly_cap integer, p_minute_cap integer) TO "service_role";

ALTER FUNCTION public."revoke_share_links"(p_local_id text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public."revoke_share_links"(p_local_id text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."revoke_share_links"(p_local_id text) TO "postgres";

GRANT EXECUTE ON FUNCTION public."revoke_share_links"(p_local_id text) TO "service_role";

GRANT EXECUTE ON FUNCTION public."revoke_share_links"(p_local_id text) TO "authenticated";

ALTER FUNCTION public."rls_auto_enable"() OWNER TO postgres;

REVOKE ALL ON FUNCTION public."rls_auto_enable"() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."rls_auto_enable"() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public."rls_auto_enable"() TO "postgres";

GRANT EXECUTE ON FUNCTION public."rls_auto_enable"() TO "anon";

GRANT EXECUTE ON FUNCTION public."rls_auto_enable"() TO "authenticated";

GRANT EXECUTE ON FUNCTION public."rls_auto_enable"() TO "service_role";

ALTER FUNCTION public."sanitize_shared_round"(p jsonb) OWNER TO postgres;

REVOKE ALL ON FUNCTION public."sanitize_shared_round"(p jsonb) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public."sanitize_shared_round"(p jsonb) TO "postgres";

GRANT EXECUTE ON FUNCTION public."sanitize_shared_round"(p jsonb) TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "postgres";

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "anon";

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO "service_role";

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='contest_players') THEN ALTER PUBLICATION "supabase_realtime" ADD TABLE public."contest_players"; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='contests') THEN ALTER PUBLICATION "supabase_realtime" ADD TABLE public."contests"; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='score_events') THEN ALTER PUBLICATION "supabase_realtime" ADD TABLE public."score_events"; END IF; END $$;
