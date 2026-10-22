-- DRAFT ONLY — NOT APPLIED. GS-5 backend foundation for review.
-- No client access policies intentionally: RLS denies access until server-side
-- capability-verifying RPCs for lookup, join, own-score writes and claim exist.
-- Do not enable a Supabase adapter until that separately reviewed work ships.
create table public.contests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  join_code text unique not null check (join_code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$'),
  data jsonb not null,
  created_at timestamptz not null default now()
);
create table public.contest_guests (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests(id) on delete cascade,
  player_id text not null,
  display_name text not null,
  capability_hash text not null, -- server-minted secret; never client-readable
  claimed_by uuid references auth.users(id),
  unique(contest_id, player_id)
);
alter table public.contests enable row level security;
alter table public.contest_guests enable row level security;
-- TODO: score event table + audited RPCs; claim must atomically verify the guest
-- capability, bind auth.uid(), reject replay and preserve historical membership.
