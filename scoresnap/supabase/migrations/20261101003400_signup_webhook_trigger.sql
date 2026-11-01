create extension if not exists pg_net;

create function public.dispatch_signup_webhook() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  webhook_secret text;
  service_jwt text;
  project_url text;
begin
  project_url := nullif(current_setting('app.settings.supabase_url', true), '');
  select decrypted_secret into webhook_secret from vault.decrypted_secrets where name = 'signup_webhook_secret' limit 1;
  select decrypted_secret into service_jwt from vault.decrypted_secrets where name = 'signup_webhook_service_jwt' limit 1;
  if project_url is null or coalesce(btrim(webhook_secret), '') = '' or coalesce(btrim(service_jwt), '') = '' then
    return new;
  end if;
  perform net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/on-user-signup',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', webhook_secret, 'Authorization', 'Bearer ' || service_jwt),
    body := jsonb_build_object('type', 'INSERT', 'table', 'users', 'schema', 'auth', 'record', jsonb_build_object(
      'id', new.id, 'email', new.email, 'user_metadata', new.raw_user_meta_data, 'app_metadata', new.raw_app_meta_data))
  );
  return new;
exception when others then
  -- Never propagate webhook/vault/configuration failures into auth signup.
  return new;
end;
$$;
revoke all on function public.dispatch_signup_webhook() from public, anon, authenticated;
grant execute on function public.dispatch_signup_webhook() to service_role;
create trigger on_auth_user_signup_webhook after insert on auth.users
for each row execute function public.dispatch_signup_webhook();
-- Existing on_auth_user_created / public.handle_new_user stays in place.
