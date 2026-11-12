-- Tournament multi-round support
-- Adds rounds table to track multiple days/rounds within a contest
-- Each round has its own group assignments (foursomes can change per round)

BEGIN;

-- Rounds table
CREATE TABLE IF NOT EXISTS public.contest_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id UUID NOT NULL REFERENCES public.contests(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL CHECK (round_number > 0),
  name TEXT NOT NULL,
  date DATE,
  course_name TEXT, -- Each round can have a different course
  course_data JSONB, -- Full course structure (holes, pars, etc.)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (contest_id, round_number)
);

ALTER TABLE public.contest_rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage rounds in own contests" ON public.contest_rounds
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.contests WHERE id = contest_id AND owner_id = auth.uid())
  );

-- Add round_id to contest_groups to track which round a group belongs to
ALTER TABLE public.contest_groups
  ADD COLUMN round_id UUID REFERENCES public.contest_rounds(id) ON DELETE CASCADE,
  ADD COLUMN tee_time TEXT, -- Tee time for this group (e.g. "10:03" or "10:03 AM")
  ADD COLUMN external_id TEXT; -- External group ID (e.g. from GolfGenius)

-- Add current_round to contests
ALTER TABLE public.contests
  ADD COLUMN current_round INTEGER DEFAULT 1,
  ADD COLUMN is_tournament BOOLEAN DEFAULT FALSE;

-- Add round_id to hole_scores to track which round a score belongs to
ALTER TABLE public.hole_scores
  ADD COLUMN round_id UUID REFERENCES public.contest_rounds(id) ON DELETE CASCADE;

-- Drop the old unique constraint and create a new one including round_id
ALTER TABLE public.hole_scores
  DROP CONSTRAINT IF EXISTS hole_scores_contest_id_player_id_hole_key;

ALTER TABLE public.hole_scores
  ADD CONSTRAINT hole_scores_unique_per_round 
    UNIQUE (contest_id, player_id, hole, round_id);

-- Indexes for performance
CREATE INDEX idx_contest_rounds_contest ON public.contest_rounds(contest_id);
CREATE INDEX idx_contest_groups_round ON public.contest_groups(round_id);
CREATE INDEX idx_hole_scores_round ON public.hole_scores(round_id);

-- Migrate existing data: create a default round for existing contests
-- This ensures backward compatibility with single-round contests
INSERT INTO public.contest_rounds (contest_id, round_number, name, date)
SELECT id, 1, 'Round 1', CURRENT_DATE
FROM public.contests
WHERE NOT EXISTS (
  SELECT 1 FROM public.contest_rounds WHERE contest_id = contests.id
);

-- Link existing groups to their contest's round 1
UPDATE public.contest_groups cg
SET round_id = cr.id
FROM public.contest_rounds cr
WHERE cg.contest_id = cr.contest_id
  AND cr.round_number = 1
  AND cg.round_id IS NULL;

-- Link existing scores to their contest's round 1
UPDATE public.hole_scores hs
SET round_id = cr.id
FROM public.contest_rounds cr
WHERE hs.contest_id = cr.contest_id
  AND cr.round_number = 1
  AND hs.round_id IS NULL;

-- Make round_id NOT NULL now that migration is complete
ALTER TABLE public.contest_groups
  ALTER COLUMN round_id SET NOT NULL;

ALTER TABLE public.hole_scores
  ALTER COLUMN round_id SET NOT NULL;

-- Add player status and per-course handicaps
ALTER TABLE public.contest_players
  ADD COLUMN status TEXT CHECK (status IN ('active', 'WD', 'NS')) DEFAULT 'active',
  ADD COLUMN course_handicaps JSONB; -- { "course_name": handicap_value }

COMMIT;
