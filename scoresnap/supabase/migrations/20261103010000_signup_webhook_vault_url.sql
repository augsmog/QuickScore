-- AUG-286: hosted Supabase rejects ALTER DATABASE ... SET app.settings.* (42501),
-- so the project URL now comes from Vault secret 'signup_webhook_project_url'.
-- Fallback: app.settings.supabase_url when present. Both null: dispatch stays inert.
-- Signup must never fail because of this trigger; every error returns NEW.
create or replace function public.dispatch_signup_webhook() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  webhook_secret text;
  service_jwt text;
  project_url text;
begin
  if not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'net' and p.proname = 'http_post') then
    return new;
  end if;
  select nullif(btrim(decrypted_secret), '') into project_url from vault.decrypted_secrets where name = 'signup_webhook_project_url' limit 1;
  project_url := coalesce(project_url, nullif(btrim(current_setting('app.settings.supabase_url', true)), ''));
  select decrypted_secret into webhook_secret from vault.decrypted_secrets where name = 'signup_webhook_secret' limit 1;
  select decrypted_secret into service_jwt from vault.decrypted_secrets where name = 'signup_webhook_service_jwt' limit 1;
  if project_url is null or project_url !~ '^https?://' or coalesce(btrim(webhook_secret), '') = '' or coalesce(btrim(service_jwt), '') = '' then
    return new;
  end if;
  perform net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/on-user-signup',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', webhook_secret, 'Authorization', 'Bearer ' || service_jwt),
    body := jsonb_build_object('type', 'INSERT', 'table', 'users', 'schema', 'auth', 'record', jsonb_build_object(
      'id', new.id, 'email', new.email, 'user_metadata', new.raw_user_meta_data, 'app_metadata', new.raw_app_meta_data))
  );
  return new;
exception when query_canceled or assert_failure or others then
  -- Never propagate webhook/vault/configuration failures into auth signup.
  return new;
end;
$$;
revoke all on function public.dispatch_signup_webhook() from public, anon, authenticated;
grant execute on function public.dispatch_signup_webhook() to service_role;
