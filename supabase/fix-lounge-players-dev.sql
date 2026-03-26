-- Allow null user_id for dev/fake players
ALTER TABLE public.lounge_players
  ALTER COLUMN user_id DROP NOT NULL;

-- Drop the old constraint that requires user_id
ALTER TABLE public.lounge_players
  DROP CONSTRAINT IF EXISTS lounge_players_user_id_fkey;

-- Re-add as nullable FK
ALTER TABLE public.lounge_players
  ADD CONSTRAINT lounge_players_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- Drop old unique and replace with one that allows null user_ids
ALTER TABLE public.lounge_players
  DROP CONSTRAINT IF EXISTS lounge_players_session_id_user_id_key;

-- Add a unique index that works with nulls (only enforces for real users)
CREATE UNIQUE INDEX IF NOT EXISTS lounge_players_session_user_unique
  ON public.lounge_players (session_id, user_id)
  WHERE user_id IS NOT NULL;
