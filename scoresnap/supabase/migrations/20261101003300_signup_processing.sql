-- Service-role-only signup ledger. No client policies.
create table public.signup_processing (
  user_id uuid primary key references auth.users(id) on delete cascade,
  claimed_at timestamptz default now(),
  referral_applied bool not null default false,
  email_status text not null default 'pending' check (email_status in ('pending','sent','failed')),
  email_id text,
  email_attempts int not null default 0,
  updated_at timestamptz
);
alter table public.signup_processing enable row level security;
revoke all on public.signup_processing from public, anon, authenticated;
grant all on public.signup_processing to service_role;

create function public.apply_signup_referral(p_user_id uuid, p_code text)
returns table(referrer_id uuid, new_count int)
language plpgsql security definer set search_path = '' as $$
begin
  update public.signup_processing set referral_applied = true
    where user_id = p_user_id and referral_applied = false;
  if not found then return; end if;
  return query update public.profiles as p
    set referral_count = coalesce(p.referral_count, 0) + 1
    where p.referral_code = p_code and p.id <> p_user_id
    returning p.id, p.referral_count;
end;
$$;

create function public.get_signup_webhook_secret() returns text
language sql security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets
  where name = 'signup_webhook_secret' limit 1;
$$;

-- Reserve one attempt atomically. Pending reservations expire after five minutes.
-- Stable Resend idempotency keys additionally protect uncertain network outcomes.
create function public.claim_signup_email(p_user_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.signup_processing
    set email_status = 'pending', email_attempts = email_attempts + 1, updated_at = now()
    where user_id = p_user_id and email_status <> 'sent' and email_attempts < 3
      and exists (select 1 from public.profiles where id = p_user_id and referral_code is not null)
      and (updated_at is null or email_status = 'failed' or updated_at < now() - interval '5 minutes');
  return found;
end;
$$;

create function public.confirm_signup_email(p_user_id uuid, p_email_id text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_email_id is null or btrim(p_email_id) = '' then raise exception 'Email confirmation required'; end if;
  update public.signup_processing set email_status = 'sent', email_id = p_email_id, updated_at = now()
    where user_id = p_user_id;
  if not found then raise exception 'Signup claim required'; end if;
  update public.profiles set onboarding_email_sent = true, onboarding_email_sent_at = now()
    where id = p_user_id;
  if not found then raise exception 'Profile required'; end if;
end;
$$;
revoke all on function public.apply_signup_referral(uuid,text), public.get_signup_webhook_secret(), public.claim_signup_email(uuid), public.confirm_signup_email(uuid,text) from public, anon, authenticated;
grant execute on function public.apply_signup_referral(uuid,text), public.get_signup_webhook_secret(), public.claim_signup_email(uuid), public.confirm_signup_email(uuid,text) to service_role;
