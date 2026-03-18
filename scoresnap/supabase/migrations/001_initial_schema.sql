-- ScoreSnap Supabase Schema
-- Run this in your Supabase SQL editor after creating a project

-- Profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  handicap REAL DEFAULT 0,
  avatar_url TEXT,
  default_bet_unit REAL DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read/update their own profile
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Contests table
CREATE TABLE IF NOT EXISTS public.contests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  course_name TEXT,
  course_pars JSONB NOT NULL, -- [4,5,3,4,...]
  course_handicaps JSONB,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  bet_unit REAL NOT NULL DEFAULT 1,
  has_teams BOOLEAN NOT NULL DEFAULT FALSE,
  team_a_name TEXT,
  team_b_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.contests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own contests" ON public.contests
  FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Users can create contests" ON public.contests
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users can update own contests" ON public.contests
  FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Users can delete own contests" ON public.contests
  FOR DELETE USING (auth.uid() = owner_id);

-- Contest groups
CREATE TABLE IF NOT EXISTS public.contest_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id UUID NOT NULL REFERENCES public.contests(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE public.contest_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage groups in own contests" ON public.contest_groups
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.contests WHERE id = contest_id AND owner_id = auth.uid())
  );

-- Contest players
CREATE TABLE IF NOT EXISTS public.contest_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id UUID NOT NULL REFERENCES public.contests(id) ON DELETE CASCADE,
  group_id UUID REFERENCES public.contest_groups(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- linked user (optional)
  name TEXT NOT NULL,
  handicap REAL NOT NULL DEFAULT 0,
  team TEXT CHECK (team IN ('A', 'B')),
  sort_order INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE public.contest_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage players in own contests" ON public.contest_players
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.contests WHERE id = contest_id AND owner_id = auth.uid())
  );

-- Contest games
CREATE TABLE IF NOT EXISTS public.contest_games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id UUID NOT NULL REFERENCES public.contests(id) ON DELETE CASCADE,
  game_type TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'
);

ALTER TABLE public.contest_games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage games in own contests" ON public.contest_games
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.contests WHERE id = contest_id AND owner_id = auth.uid())
  );

-- Hole scores
CREATE TABLE IF NOT EXISTS public.hole_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id UUID NOT NULL REFERENCES public.contests(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.contest_players(id) ON DELETE CASCADE,
  hole INTEGER NOT NULL CHECK (hole BETWEEN 1 AND 18),
  strokes INTEGER NOT NULL DEFAULT 0,
  putts INTEGER NOT NULL DEFAULT 0,
  fairway TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (contest_id, player_id, hole)
);

ALTER TABLE public.hole_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage scores in own contests" ON public.hole_scores
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.contests WHERE id = contest_id AND owner_id = auth.uid())
  );

-- Enable realtime for live scoring
ALTER PUBLICATION supabase_realtime ADD TABLE public.hole_scores;

-- Indexes for performance
CREATE INDEX idx_contests_owner ON public.contests(owner_id);
CREATE INDEX idx_contest_players_contest ON public.contest_players(contest_id);
CREATE INDEX idx_hole_scores_contest ON public.hole_scores(contest_id);
CREATE INDEX idx_hole_scores_player ON public.hole_scores(player_id);
