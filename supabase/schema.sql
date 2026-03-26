-- GameShuffle Database Schema
-- Run this in the Supabase SQL Editor

-- Users table (extends Supabase auth.users)
CREATE TABLE public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  twitch_id text UNIQUE,
  twitch_username text,
  twitch_avatar text,
  display_name text,
  role text DEFAULT 'user',
  context_profile jsonb DEFAULT '{}',
  dob date,
  age_context_unlocked boolean DEFAULT false,
  id_verified boolean DEFAULT false,
  id_verified_at timestamptz,
  id_verification_status text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Saved randomizer configurations
CREATE TABLE public.saved_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  randomizer_slug text NOT NULL,
  config_name text NOT NULL,
  config_data jsonb NOT NULL,
  share_token text UNIQUE,
  is_public boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Overlay state for stream integrations
CREATE TABLE public.overlay_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE UNIQUE,
  current_result jsonb,
  randomizer_slug text,
  last_triggered timestamptz,
  display_until timestamptz
);

-- Tournaments
CREATE TABLE public.tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  game_slug text NOT NULL,
  format text NOT NULL,
  status text DEFAULT 'setup',
  bracket_data jsonb NOT NULL,
  participants jsonb NOT NULL,
  settings jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Twitch OAuth connections
CREATE TABLE public.twitch_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE UNIQUE,
  access_token text,
  refresh_token text,
  scope text[],
  broadcaster_id text,
  eventsub_ids jsonb DEFAULT '{}',
  connected_at timestamptz DEFAULT now()
);

-- Stream sessions
CREATE TABLE public.stream_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  twitch_stream_id text,
  status text DEFAULT 'active',
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  active_randomizer_slug text,
  active_tournament_id uuid REFERENCES public.tournaments(id),
  session_settings jsonb DEFAULT '{}'
);

-- Competitive game configs (admin-managed)
CREATE TABLE public.game_competitive_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_slug text UNIQUE NOT NULL,
  tier_list_url text,
  tier_list_updated date,
  standard_ruleset jsonb DEFAULT '{}',
  community_links jsonb DEFAULT '[]',
  notes text,
  updated_at timestamptz DEFAULT now()
);

-- Game tracks/stages (admin-managed)
CREATE TABLE public.game_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_slug text NOT NULL,
  name text NOT NULL,
  shortcode text NOT NULL,
  cup text,
  category text,
  status text DEFAULT 'legal',
  comp_notes text,
  sort_order int DEFAULT 0,
  image_url text,
  updated_at timestamptz DEFAULT now()
);

-- Game characters (admin-managed)
CREATE TABLE public.game_characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_slug text NOT NULL,
  name text NOT NULL,
  tier text,
  weight_class text,
  tags text[],
  is_banned boolean DEFAULT false,
  comp_notes text,
  image_url text,
  sort_order int DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

-- Session snapshots for recovery
CREATE TABLE public.session_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.stream_sessions(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  trigger text NOT NULL,
  captured_at timestamptz DEFAULT now(),
  state jsonb NOT NULL,
  notes text,
  is_pinned boolean DEFAULT false
);

-- Enable Row Level Security on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.overlay_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.twitch_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stream_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_competitive_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Users: can read own row, admins can read all
CREATE POLICY "Users can read own data" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own data" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- Saved configs: owner CRUD, public configs readable by all
CREATE POLICY "Users can manage own configs" ON public.saved_configs
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Public configs are readable" ON public.saved_configs
  FOR SELECT USING (is_public = true);

-- Overlay state: owner manages, public read for overlay display
CREATE POLICY "Users can manage own overlay" ON public.overlay_state
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Overlay state is publicly readable" ON public.overlay_state
  FOR SELECT USING (true);

-- Tournaments: owner manages, public read
CREATE POLICY "Users can manage own tournaments" ON public.tournaments
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Tournaments are publicly readable" ON public.tournaments
  FOR SELECT USING (true);

-- Twitch connections: owner only
CREATE POLICY "Users can manage own twitch connection" ON public.twitch_connections
  FOR ALL USING (auth.uid() = user_id);

-- Stream sessions: owner manages, public read
CREATE POLICY "Users can manage own sessions" ON public.stream_sessions
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Sessions are publicly readable" ON public.stream_sessions
  FOR SELECT USING (true);

-- Game competitive configs: public read, admin write
CREATE POLICY "Competitive configs are publicly readable" ON public.game_competitive_configs
  FOR SELECT USING (true);

-- Game tracks: public read, admin write
CREATE POLICY "Game tracks are publicly readable" ON public.game_tracks
  FOR SELECT USING (true);

-- Game characters: public read, admin write
CREATE POLICY "Game characters are publicly readable" ON public.game_characters
  FOR SELECT USING (true);

-- Session snapshots: owner only
CREATE POLICY "Users can manage own snapshots" ON public.session_snapshots
  FOR ALL USING (auth.uid() = user_id);

-- Auto-create user row on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, display_name)
  VALUES (new.id, new.raw_user_meta_data ->> 'display_name');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_saved_configs_updated_at
  BEFORE UPDATE ON public.saved_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_tournaments_updated_at
  BEFORE UPDATE ON public.tournaments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_game_competitive_configs_updated_at
  BEFORE UPDATE ON public.game_competitive_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_game_tracks_updated_at
  BEFORE UPDATE ON public.game_tracks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_game_characters_updated_at
  BEFORE UPDATE ON public.game_characters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
