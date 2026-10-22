-- 005: fix infinite recursion (42P17) in contest RLS policies.
-- contest_players' SELECT policy queried contest_players (and contests' policy queried contest_players),
-- so every read errored. Membership checks now go through SECURITY DEFINER helpers that bypass RLS.
create or replace function public.is_contest_owner(p_contest uuid) returns boolean
language sql stable security definer set search_path = pg_catalog as $$
  select exists(select 1 from public.contests c where c.id = p_contest and c.owner_id = auth.uid());
$$;
create or replace function public.is_contest_member(p_contest uuid) returns boolean
language sql stable security definer set search_path = pg_catalog as $$
  select exists(select 1 from public.contest_players p where p.contest_id = p_contest and p.user_id = auth.uid())
      or exists(select 1 from public.contests c where c.id = p_contest and c.owner_id = auth.uid());
$$;
revoke all on function public.is_contest_owner(uuid), public.is_contest_member(uuid) from public, anon;
grant execute on function public.is_contest_owner(uuid), public.is_contest_member(uuid) to authenticated;

drop policy if exists "Participants can view contests" on public.contests;
create policy "Participants can view contests" on public.contests for select to authenticated
  using (public.is_contest_member(id));
drop policy if exists "Owner full access" on public.contests;
create policy "Owner full access" on public.contests for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "Participants can view players" on public.contest_players;
create policy "Participants can view players" on public.contest_players for select to authenticated
  using (public.is_contest_member(contest_id));
drop policy if exists "Owner can insert players" on public.contest_players;
create policy "Owner can insert players" on public.contest_players for insert to authenticated
  with check (public.is_contest_owner(contest_id));
drop policy if exists "Self or owner can update" on public.contest_players;
create policy "Self or owner can update" on public.contest_players for update to authenticated
  using (user_id = auth.uid() or public.is_contest_owner(contest_id))
  with check (user_id = auth.uid() or public.is_contest_owner(contest_id));
drop policy if exists "Users can join contests" on public.contest_players;
create policy "Users can join contests" on public.contest_players for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Participants can view scores" on public.score_events;
create policy "Participants can view scores" on public.score_events for select to authenticated
  using (public.is_contest_member(contest_id));
drop policy if exists "Participants can insert scores" on public.score_events;
create policy "Participants can insert scores" on public.score_events for insert to authenticated
  with check (public.is_contest_member(contest_id) and entered_by = auth.uid());
