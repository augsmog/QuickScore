-- REVIEW ONLY. Requires 002_contest_sharing_draft.sql; do not apply automatically.
-- Slice 1 polls get_shared_round every 10 seconds; no public Realtime channels.
begin;
create table public.published_rounds (
  contest_id uuid primary key references public.contests(id) on delete cascade,
  owner_id uuid not null references auth.users(id),
  local_id text not null,
  snapshot jsonb not null,
  ended_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(owner_id, local_id)
);
create table public.share_links (
  token_hash text primary key,
  contest_id uuid not null references public.published_rounds(contest_id) on delete cascade,
  expires_at timestamptz not null,
  revoked_at timestamptz
);
alter table public.published_rounds enable row level security;
alter table public.share_links enable row level security;
revoke all on public.published_rounds, public.share_links from anon, authenticated;

-- Rebuild the JSON on the server: never persist arbitrary client fields.
create function public.sanitize_shared_round(p jsonb) returns jsonb
language plpgsql immutable set search_path = pg_catalog as $$
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
end $$;
revoke all on function public.sanitize_shared_round(jsonb) from public, anon, authenticated;

create function public.publish_shared_round(p_local_id text, p_snapshot jsonb) returns void
language plpgsql security definer set search_path = pg_catalog as $$
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
    insert into public.contests(owner_id,join_code,data)
      values(auth.uid(),translate(upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)),'01','GH'),'{}'::jsonb) returning id into cid;
  end if;
  if (clean->>'completed')::boolean and ended is null then ended := now(); end if;
  insert into public.published_rounds(contest_id,owner_id,local_id,snapshot,ended_at)
    values(cid,auth.uid(),p_local_id,clean,ended)
    on conflict(contest_id) do update set snapshot=excluded.snapshot, ended_at=excluded.ended_at, updated_at=now();
  -- Active links have no scheduled round end. Completion fixes their expiry once.
  if ended is not null then update public.share_links set expires_at=least(expires_at,ended + interval '7 days') where contest_id=cid; end if;
end $$;

create function public.create_share_link(p_local_id text) returns text
language plpgsql security definer set search_path = pg_catalog as $$
declare r public.published_rounds; token text;
begin
  select * into r from public.published_rounds where owner_id=auth.uid() and local_id=p_local_id for update;
  if not found or not exists(select 1 from public.contests where id=r.contest_id and owner_id=auth.uid()) then raise exception 'owner required'; end if;
  if r.ended_at + interval '7 days' <= now() then raise exception 'round expired'; end if;
  token := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  insert into public.share_links(token_hash,contest_id,expires_at)
    values(encode(sha256(convert_to(token,'UTF8')),'hex'),r.contest_id,coalesce(r.ended_at + interval '7 days','infinity'::timestamptz));
  return token;
end $$;

create function public.revoke_share_links(p_local_id text) returns void
language plpgsql security definer set search_path = pg_catalog as $$
declare cid uuid;
begin
  select r.contest_id into cid from public.published_rounds r join public.contests c on c.id=r.contest_id
    where r.owner_id=auth.uid() and c.owner_id=auth.uid() and r.local_id=p_local_id for update of r;
  if cid is null then raise exception 'owner required'; end if;
  update public.share_links set revoked_at=now() where contest_id=cid and revoked_at is null;
end $$;

create function public.get_shared_round(p_token text) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare link public.share_links; snapshot jsonb;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'invalid link'; end if;
  select * into link from public.share_links where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
  if not found then raise exception 'invalid link'; end if;
  if link.revoked_at is not null then raise exception 'revoked link'; end if;
  if link.expires_at <= now() then raise exception 'expired link'; end if;
  select r.snapshot into snapshot from public.published_rounds r where r.contest_id=link.contest_id;
  return public.sanitize_shared_round(snapshot);
end $$;
revoke all on function public.publish_shared_round(text,jsonb), public.create_share_link(text), public.revoke_share_links(text), public.get_shared_round(text) from public, anon, authenticated;
grant execute on function public.publish_shared_round(text,jsonb), public.create_share_link(text), public.revoke_share_links(text) to authenticated;
grant execute on function public.get_shared_round(text) to anon, authenticated;
commit;
