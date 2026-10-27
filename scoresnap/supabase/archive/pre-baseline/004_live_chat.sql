-- Applied 2026-10-22 to pltgbizexllikiwryozm as live_chat_slice2 (after 003 live_share_slice1).
begin;
create table public.round_messages (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.published_rounds(contest_id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 30),
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default clock_timestamp(),
  removed_at timestamptz,
  sender_session_hash text not null check (sender_session_hash ~ '^[a-f0-9]{64}$')
);
create index round_messages_recent on public.round_messages(contest_id, created_at desc);
create index round_messages_session on public.round_messages(contest_id, sender_session_hash, created_at desc);
alter table public.round_messages enable row level security;
revoke all on public.round_messages from public, anon, authenticated;

-- Private helper; capability validation is repeated for every public read/write.
create function public.chat_contest(p_token text) returns uuid
language plpgsql security definer set search_path = pg_catalog as $$
declare link public.share_links;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'invalid link'; end if;
  select * into link from public.share_links where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
  if not found then raise exception 'invalid link'; end if;
  if link.revoked_at is not null then raise exception 'revoked link'; end if;
  if link.expires_at <= clock_timestamp() then raise exception 'expired link'; end if;
  return link.contest_id;
end $$;

create function public.post_message(p_token text, p_session text, p_name text, p_body text) returns void
language plpgsql security definer set search_path = pg_catalog as $$
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
end $$;

create function public.list_messages(p_token text, p_since timestamptz default null)
returns table(display_name text, body text, created_at timestamptz)
language plpgsql security definer set search_path = pg_catalog as $$
declare cid uuid;
begin
  cid := public.chat_contest(p_token);
  return query select m.display_name,m.body,m.created_at from (
    select r.* from public.round_messages r where r.contest_id=cid and r.removed_at is null
      and (p_since is null or r.created_at > p_since)
    order by r.created_at desc,r.id desc limit 200
  ) m order by m.created_at,m.id;
end $$;

-- Hosts use their local mapping, never a public token, to obtain moderation IDs.
create function public.list_host_messages(p_local_id text)
returns table(id uuid, display_name text, body text, created_at timestamptz)
language plpgsql security definer set search_path = pg_catalog as $$
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
end $$;

create function public.remove_message(p_message_id uuid) returns void
language plpgsql security definer set search_path = pg_catalog as $$
begin
  update public.round_messages m set removed_at=coalesce(m.removed_at,clock_timestamp())
  where m.id=p_message_id and exists (
    select 1 from public.published_rounds r join public.contests c on c.id=r.contest_id
    where r.contest_id=m.contest_id and r.owner_id=auth.uid() and c.owner_id=auth.uid()
      and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
  );
  if not found then raise exception 'owner required'; end if;
end $$;
revoke all on function public.chat_contest(text), public.post_message(text,text,text,text),
  public.list_messages(text,timestamptz), public.list_host_messages(text), public.remove_message(uuid)
  from public, anon, authenticated;
grant execute on function public.post_message(text,text,text,text), public.list_messages(text,timestamptz) to anon, authenticated;
grant execute on function public.list_host_messages(text), public.remove_message(uuid) to authenticated;
commit;
