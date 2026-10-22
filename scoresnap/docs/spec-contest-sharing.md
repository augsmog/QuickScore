# Feature Spec: Contest Sharing & Real-Time Sync

> **Superseded in part by GS-5 (Augie, Oct 21, 2026):** the organizer needs an account; players join by code as guests with no account and can claim their history later. Where the sections below make anonymous users view-only, GS-5 wins.

## GS-5 decision and current implementation (Oct 21, 2026)

The organizer needs an account. Players join by code as guests, without an account, and enter their own scores in the browser. They can later create an account to claim round history. This owner decision supersedes the previous anonymous view-only rule.

### Implemented

- Every new local contest receives a unique six-character code, excluding 0, 1, I, O. Existing contests receive a code when opened. Organizer screen offers copy/share of the join URL.
- Home offers Join with code; `/join/[code]` bypasses sign-in and onboarding. Guests supply a display name, then choose an existing player slot. Adding oneself is not allowed; the organizer must add missing players.
- A separate random UUID and contest/player bindings persist in `snapscore-guest`. A guest cannot switch their binding to another slot. Guest UI edits only their own strokes and shows gross totals. Existing organizer scoring and game calculations remain unchanged.
- `ContestJoinService` isolates lookup; `localContestJoinService` reads the persisted local contest store. Codes work only in the same browser storage, not another browser, device, or isolated context. Copy/share does not imply cloud sharing.
- Configured Supabase credentials activate real email/provider authentication and session initialization. Contest creation requires an account in that mode. `EXPO_PUBLIC_OFFLINE_MODE=true` explicitly bypasses real auth: the local user acts as organizer so offline use and e2e continue working. Without credentials auth retains the existing local prototype behavior.
- `claimGuestHistory()` returns the clearly marked “Claim your rounds — coming soon” placeholder explaining that rounds remain on this device. Clearing browser storage loses local rounds.

### Backend status and Deferred

The checked-in schema has profiles, scans and settlements, but no contest sharing tables. No Supabase contest adapter is enabled. No migration was applied.

- Review and apply the draft `supabase/migrations/002_contest_sharing_draft.sql` in a separately authorized backend rollout.
- Build server RPCs for code lookup, atomic slot reservations and score writes using server-issued guest capabilities. Local UUIDs and codes are not authorization credentials. The local prototype cannot prevent two devices claiming a slot; do not expose tables directly to unauthenticated clients.
- Add secure claim RPC verifying guest capabilities and authenticated account ownership, preserving round history transactionally; then implement it behind `claimGuestHistory()`.
- Implement Supabase adapter, realtime sync, conflict handling, offline queue and cross-device recovery.
- QR codes, player presence, organizer guest removal and optional self-add policy remain deferred.
- Verify real auth against a configured project (including email confirmation and provider setup). Automated verification uses explicit offline mode and creates no accounts.

### Verification

Unit tests cover codes, collision handling, binding validation/idempotency and local lookup. Browser e2e tests an isolated context's explicit local lookup error, then joins using a distinct guest identity in the organizer's browser, enters scores, checks totals and persisted state, and captures screenshots 15–19 at 390×844.

---

## Original spec (kept for the backend phases)

## Overview

Allow contest creators to invite other players to join a contest on their own devices. All participants see live score updates, leaderboard changes, and game results in real time. Sharing is initiated via QR code or text/iMessage invite link.

## Current State

- **Contests are local-only**: stored in Zustand + AsyncStorage on the creator's device
- **Auth is stubbed**: `auth-store.ts` creates local user IDs (`apple-{timestamp}`, `google-{timestamp}`) with TODO comments for real Supabase auth
- **Supabase client exists** (`src/db/supabase.ts`) but is only used for auth session storage
- **No contest data in Supabase**: the `public` schema has `profiles`, `scans`, `settlements`, but no contest tables
- **Contest store** (`contest-store.ts`) has `Contest`, `ContestGroup`, and `Player` interfaces with all scoring logic running locally

## Architecture

### Phase 1: Backend Foundation

#### 1a. Activate Real Supabase Auth

The auth store currently fakes user sessions locally. Before sharing can work, we need real auth:

- Wire `signInWithApple` to `supabase.auth.signInWithIdToken({ provider: 'apple', ... })`
- Wire `signInWithGoogle` to `supabase.auth.signInWithIdToken({ provider: 'google', ... })`
- Wire `signUpWithEmail` / `signInWithEmail` to `supabase.auth.signUp` / `signInWithPassword`
- Add `onAuthStateChange` listener to sync session
- Populate `profiles` table on first sign-in (trigger or client-side upsert)
- Anonymous users (`skipSignIn`) can view shared contests but not create or join them — prompt to sign up

#### 1b. New Supabase Tables

```sql
-- Contests table (server-side source of truth)
create table public.contests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) not null,
  name text not null default '',
  course jsonb not null,              -- Course object (name, holes[])
  status text not null default 'active' check (status in ('active', 'completed')),
  bet_unit numeric not null default 1,
  has_teams boolean default false,
  team_a_name text,
  team_b_name text,
  games text[] not null default '{}',  -- GameType[]
  game_config jsonb,                   -- GameConfig
  auxiliary_data jsonb,                -- AuxiliaryData
  invite_code text unique not null,    -- 6-char alphanumeric, for joining
  current_hole int default 1,          -- tracks group progress for GPS
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Players within a contest (each row = one player in one group)
create table public.contest_players (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid references public.contests(id) on delete cascade not null,
  user_id uuid references auth.users(id),  -- nullable for non-app players
  group_id text not null,
  name text not null,
  handicap numeric default 0,
  team text check (team in ('A', 'B', null)),
  scores int[] default array[]::int[],     -- 18 elements, 0 = not played
  putts int[] default array[]::int[],
  joined_at timestamptz default now(),
  unique(contest_id, user_id)              -- one entry per user per contest
);

-- Score change events for real-time sync
create table public.score_events (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid references public.contests(id) on delete cascade not null,
  player_id uuid references public.contest_players(id) on delete cascade not null,
  hole int not null check (hole between 1 and 18),
  strokes int not null check (strokes between 1 and 15),
  entered_by uuid references auth.users(id) not null,
  created_at timestamptz default now()
);

-- Indexes
create index idx_contest_players_contest on public.contest_players(contest_id);
create index idx_score_events_contest on public.score_events(contest_id);
create index idx_contests_invite_code on public.contests(invite_code);

-- RLS policies
alter table public.contests enable row level security;
alter table public.contest_players enable row level security;
alter table public.score_events enable row level security;

-- Contests: owner can do everything, participants can read
create policy "Owner full access" on public.contests
  for all using (owner_id = auth.uid());
create policy "Participants can view" on public.contests
  for select using (
    id in (select contest_id from public.contest_players where user_id = auth.uid())
  );

-- Players: contest participants can read, owner + self can update
create policy "Participants can view players" on public.contest_players
  for select using (
    contest_id in (select contest_id from public.contest_players where user_id = auth.uid())
  );
create policy "Self or owner can update scores" on public.contest_players
  for update using (
    user_id = auth.uid() or
    contest_id in (select id from public.contests where owner_id = auth.uid())
  );

-- Score events: any participant can insert, all participants can read
create policy "Participants can insert scores" on public.score_events
  for insert with check (
    contest_id in (select contest_id from public.contest_players where user_id = auth.uid())
  );
create policy "Participants can view scores" on public.score_events
  for select using (
    contest_id in (select contest_id from public.contest_players where user_id = auth.uid())
  );
```

#### 1c. Realtime Channels

Use Supabase Realtime to push live updates:

```typescript
// Subscribe to a contest's score changes
const channel = supabase
  .channel(`contest:${contestId}`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'contest_players',
    filter: `contest_id=eq.${contestId}`
  }, (payload) => {
    // Update local Zustand store with new scores
  })
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'score_events',
    filter: `contest_id=eq.${contestId}`
  }, (payload) => {
    // Animate score update in UI
  })
  .subscribe();
```

### Phase 2: Sharing Flow

#### 2a. Invite Code Generation

When a contest is created, generate a unique 6-character invite code (e.g., `GKFM42`). This is stored in the `contests.invite_code` column.

The invite resolves to a deep link: `snapscore://join/{inviteCode}` with a web fallback at `https://snapscore.app/join/{inviteCode}` that redirects to the App Store if the app isn't installed.

#### 2b. Share Sheet (Creator Side)

Add a **Share** button to the contest header (next to Edit and Camera buttons in `_layout.tsx`):

- Tapping opens a bottom sheet with:
  - QR code encoding the deep link (use `react-native-qrcode-svg`)
  - "Copy Link" button
  - "Share via Text" button (uses `Share.share()` from React Native)
  - Invite code displayed prominently: `GKFM42`
  - List of currently joined players with online/offline status dots

#### 2c. Join Flow (Invitee Side)

1. Player taps invite link or scans QR code
2. App opens to a **Join Contest** screen showing: contest name, course, creator name, current players, games being played
3. Player taps "Join" → they're added to `contest_players` with their `user_id`
4. They're assigned to a group (auto or by creator) — for v1, all joiners go into Group 1
5. Realtime subscription starts immediately
6. Contest appears in their Contests tab

#### 2d. Deep Link Configuration

Add to `app.json`:
```json
{
  "expo": {
    "scheme": "snapscore",
    "ios": {
      "associatedDomains": ["applinks:snapscore.app"]
    }
  }
}
```

Handle in a new route `app/join/[code].tsx` that:
- Looks up the invite code via `supabase.from('contests').select().eq('invite_code', code)`
- Shows contest preview
- Adds player on confirmation

### Phase 3: Hybrid Store (Local + Remote)

The contest store needs to work in two modes:

- **Local contests** (no sharing): continue using AsyncStorage exactly as today. Solo users who never share shouldn't need network.
- **Shared contests**: read/write to Supabase, with local cache for offline resilience.

Add a `shared: boolean` flag to the `Contest` interface. When `shared` is true:
- `updateScore()` writes to Supabase `contest_players` + inserts a `score_event`
- Realtime subscription keeps local state in sync
- On app launch, fetch latest state from Supabase for all shared contests
- If offline, queue score changes and sync when connection restores (optimistic updates)

### Phase 4: Score Entry Permissions

Each player can enter their own scores (you chose "full real-time sync"):

- On the Scorecard tab, each player sees their own scores as editable, others as read-only
- The contest creator retains "admin" rights — can edit anyone's scores (for corrections)
- Score changes show a brief toast: "Mike updated Hole 7: Bogey"

## New Files

| File | Purpose |
|------|---------|
| `src/services/contest-sync.ts` | Supabase CRUD + realtime subscription logic |
| `src/services/invite.ts` | Invite code generation, deep link handling |
| `app/join/[code].tsx` | Join contest screen |
| `src/ui/ShareSheet.tsx` | Share bottom sheet component (QR + link + text) |
| `src/ui/OnlineIndicator.tsx` | Green/gray dot for player online status |

## Modified Files

| File | Changes |
|------|---------|
| `src/stores/auth-store.ts` | Replace stub auth with real Supabase auth calls |
| `src/stores/contest-store.ts` | Add `shared` flag, dual local/remote write paths |
| `app/contest/new.tsx` | Generate invite code on creation, option to "Create & Share" |
| `app/contest/[id]/_layout.tsx` | Add Share button to header |
| `app/contest/[id]/scorecard.tsx` | Permission-aware score entry (own scores vs read-only) |
| `app/(tabs)/contests.tsx` | Show shared contests with sync indicator |
| `app.json` | Add associated domains for deep links |

## Migration Path

1. Ship auth activation first (users start getting real Supabase user IDs)
2. Add contest tables + sync service
3. Add sharing UI (share sheet, join flow)
4. Backfill: offer existing local contests a "Share This Contest" action that uploads to Supabase

## Open Questions

- Should non-authenticated (anonymous) users be able to join as view-only spectators?
- Max players per shared contest? (Supabase Realtime has a 100 concurrent connections limit per channel)
- Should we support kicking/removing a player from a shared contest?
- Conflict resolution: if two people update the same player's score simultaneously, last-write-wins or prompt?
