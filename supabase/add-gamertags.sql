-- Add gamertag fields and public profile support to users table
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS username text UNIQUE,
  ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS gamertags jsonb DEFAULT '{}';

-- RLS policy for public profiles
CREATE POLICY "Public profiles are readable" ON public.users
  FOR SELECT USING (is_public = true);

-- Public configs readable when user is public
CREATE POLICY "Public user configs are readable" ON public.saved_configs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = saved_configs.user_id
      AND users.is_public = true
    )
  );
