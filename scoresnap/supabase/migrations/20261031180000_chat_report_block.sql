begin;
create table public.chat_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_session_hash text not null,
  reporter_user_id uuid references auth.users(id) on delete set null,
  contest_id uuid not null references public.published_rounds(contest_id) on delete cascade,
  message_id uuid not null references public.round_messages(id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 300),
  created_at timestamptz not null default clock_timestamp(),
  unique (reporter_session_hash, message_id)
);
-- No client read policies. The moderation team reads through the service role.
alter table public.chat_reports enable row level security;
revoke all on public.chat_reports from public, anon, authenticated;
grant select on public.chat_reports to service_role;

create function public.chat_moderation_contest(p_token text, p_local_id text) returns uuid
language plpgsql security definer set search_path = pg_catalog as $$
declare cid uuid;
begin
  if p_token is not null then return public.chat_contest(p_token); end if;
  select r.contest_id into cid from public.published_rounds r join public.contests c on c.id=r.contest_id
    where r.local_id=p_local_id and r.owner_id=auth.uid() and c.owner_id=auth.uid()
    and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false);
  if cid is null then raise exception 'owner required'; end if;
  return cid;
end $$;
revoke all on function public.chat_moderation_contest(text,text) from public, anon, authenticated;

create function public.list_moderated_messages(p_token text, p_local_id text, p_session text)
returns table(id uuid, display_name text, body text, created_at timestamptz, participant_id text, is_own boolean)
language plpgsql security definer set search_path = pg_catalog as $$
declare cid uuid; own_hash text;
begin
  cid := public.chat_moderation_contest(p_token,p_local_id);
  if p_session is null or p_session !~ '^[a-f0-9]{64}$' then raise exception 'invalid session'; end if;
  own_hash := encode(sha256(convert_to(p_session,'UTF8')),'hex');
  return query select m.id,m.display_name,m.body,m.created_at,
    encode(sha256(convert_to(cid::text || ':' || m.sender_session_hash,'UTF8')),'hex'),
    m.sender_session_hash=own_hash
    from (select r.* from public.round_messages r where r.contest_id=cid and r.removed_at is null
      order by r.created_at desc,r.id desc limit 200) m order by m.created_at,m.id;
end $$;

create function public.report_chat_message(p_token text, p_local_id text, p_session text, p_message_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = pg_catalog as $$
declare cid uuid; reporter text;
begin
  cid := public.chat_moderation_contest(p_token,p_local_id);
  if p_session is null or p_session !~ '^[a-f0-9]{64}$'
    or p_reason is null or char_length(btrim(p_reason)) not between 1 and 300 then raise exception 'invalid report'; end if;
  reporter := encode(sha256(convert_to(p_session,'UTF8')),'hex');
  if not exists (select 1 from public.round_messages m where m.id=p_message_id and m.contest_id=cid
    and m.sender_session_hash<>reporter) then raise exception 'invalid message'; end if;
  insert into public.chat_reports(reporter_session_hash,reporter_user_id,contest_id,message_id,reason)
    values(reporter,auth.uid(),cid,p_message_id,btrim(p_reason))
    on conflict (reporter_session_hash,message_id) do nothing;
end $$;
revoke all on function public.list_moderated_messages(text,text,text),
  public.report_chat_message(text,text,text,uuid,text) from public, anon, authenticated;
grant execute on function public.list_moderated_messages(text,text,text),
  public.report_chat_message(text,text,text,uuid,text) to anon, authenticated;
commit;
