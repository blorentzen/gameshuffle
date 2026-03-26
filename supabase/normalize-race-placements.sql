-- Individual placements — one row per player per race
-- Allows each player to self-report, host to override

CREATE TABLE IF NOT EXISTS public.lounge_placements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.lounge_sessions(id) ON DELETE CASCADE,
  player_id uuid REFERENCES public.lounge_players(id) ON DELETE CASCADE,
  race_number int NOT NULL,
  position int,                          -- 1-12, null if not yet submitted
  submitted_by uuid,                     -- user_id of who entered this (self or host override)
  is_override boolean DEFAULT false,     -- true if host corrected this
  submitted_at timestamptz DEFAULT now(),
  UNIQUE(session_id, player_id, race_number)
);

-- Enable RLS
ALTER TABLE public.lounge_placements ENABLE ROW LEVEL SECURITY;

-- Anyone can read placements
DROP POLICY IF EXISTS "Lounge placements are publicly readable" ON public.lounge_placements;
CREATE POLICY "Lounge placements are publicly readable" ON public.lounge_placements
  FOR SELECT USING (true);

-- Players can insert/update their own placements
DROP POLICY IF EXISTS "Players can submit own placement" ON public.lounge_placements;
CREATE POLICY "Players can submit own placement" ON public.lounge_placements
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.lounge_players
      WHERE lounge_players.id = lounge_placements.player_id
      AND lounge_players.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Players can update own placement" ON public.lounge_placements;
CREATE POLICY "Players can update own placement" ON public.lounge_placements
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.lounge_players
      WHERE lounge_players.id = lounge_placements.player_id
      AND lounge_players.user_id = auth.uid()
    )
  );

-- Organizer can manage all placements (overrides, filling missing)
DROP POLICY IF EXISTS "Organizer can manage placements" ON public.lounge_placements;
CREATE POLICY "Organizer can manage placements" ON public.lounge_placements
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.lounge_sessions
      WHERE lounge_sessions.id = lounge_placements.session_id
      AND lounge_sessions.organizer_id = auth.uid()
    )
  );

-- Enable realtime
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.lounge_placements;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
