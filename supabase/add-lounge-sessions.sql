-- Lounge scoring sessions (safe to re-run)

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Organizer can manage lounge sessions" ON public.lounge_sessions;
DROP POLICY IF EXISTS "Lounge sessions are publicly readable" ON public.lounge_sessions;

-- Create table if not exists
CREATE TABLE IF NOT EXISTS public.lounge_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_slug text NOT NULL,
  organizer_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  status text DEFAULT 'waiting',
  race_count int DEFAULT 12,
  scoring_table jsonb NOT NULL,
  players jsonb NOT NULL DEFAULT '[]',
  races jsonb DEFAULT '[]',
  final_standings jsonb,
  share_token text UNIQUE,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- Enable RLS
ALTER TABLE public.lounge_sessions ENABLE ROW LEVEL SECURITY;

-- Organizer can manage their sessions
CREATE POLICY "Organizer can manage lounge sessions" ON public.lounge_sessions
  FOR ALL USING (auth.uid() = organizer_id);

-- Anyone can read lounge sessions (for joining)
CREATE POLICY "Lounge sessions are publicly readable" ON public.lounge_sessions
  FOR SELECT USING (true);

-- Enable realtime for live scoring (ignore if already added)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.lounge_sessions;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
