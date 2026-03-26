-- Add settings column to lounge_sessions (safe to re-run)
ALTER TABLE public.lounge_sessions
  ADD COLUMN IF NOT EXISTS settings jsonb DEFAULT '{}';
