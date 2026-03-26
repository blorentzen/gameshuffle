-- Add is_dropped column to lounge_players
ALTER TABLE public.lounge_players
  ADD COLUMN IF NOT EXISTS is_dropped boolean DEFAULT false;
