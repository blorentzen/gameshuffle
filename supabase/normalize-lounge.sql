-- Normalize lounge sessions — separate players and races tables
-- Safe to re-run

-- Update lounge_sessions to remove JSONB player/race columns
-- (Keep them for now as backup, remove later)

-- Lounge players — one row per player per session
CREATE TABLE IF NOT EXISTS public.lounge_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.lounge_sessions(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  team int,                         -- team index (0-based), null for FFA
  character text,                   -- character name
  character_variant text,           -- color variant name
  is_ready boolean DEFAULT false,
  is_late boolean DEFAULT false,
  joined_at timestamptz DEFAULT now(),
  UNIQUE(session_id, user_id)       -- one entry per player per session
);

-- Lounge race results — one row per race per session
CREATE TABLE IF NOT EXISTS public.lounge_races (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.lounge_sessions(id) ON DELETE CASCADE,
  race_number int NOT NULL,
  placements jsonb NOT NULL DEFAULT '{}',   -- { <lounge_player_id>: position }
  submitted_at timestamptz DEFAULT now(),
  UNIQUE(session_id, race_number)           -- one entry per race per session
);

-- Enable RLS
ALTER TABLE public.lounge_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lounge_races ENABLE ROW LEVEL SECURITY;

-- Players: anyone in the session can read, users manage their own row
DROP POLICY IF EXISTS "Lounge players are publicly readable" ON public.lounge_players;
CREATE POLICY "Lounge players are publicly readable" ON public.lounge_players
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert themselves into lounge" ON public.lounge_players;
CREATE POLICY "Users can insert themselves into lounge" ON public.lounge_players
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own lounge player" ON public.lounge_players;
CREATE POLICY "Users can update own lounge player" ON public.lounge_players
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Organizer can manage lounge players" ON public.lounge_players;
CREATE POLICY "Organizer can manage lounge players" ON public.lounge_players
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.lounge_sessions
      WHERE lounge_sessions.id = lounge_players.session_id
      AND lounge_sessions.organizer_id = auth.uid()
    )
  );

-- Races: anyone can read, organizer can manage
DROP POLICY IF EXISTS "Lounge races are publicly readable" ON public.lounge_races;
CREATE POLICY "Lounge races are publicly readable" ON public.lounge_races
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Organizer can manage lounge races" ON public.lounge_races;
CREATE POLICY "Organizer can manage lounge races" ON public.lounge_races
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.lounge_sessions
      WHERE lounge_sessions.id = lounge_races.session_id
      AND lounge_sessions.organizer_id = auth.uid()
    )
  );

-- Enable realtime on new tables
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.lounge_players;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.lounge_races;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
