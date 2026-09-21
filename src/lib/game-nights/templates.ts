import "server-only";

/**
 * Night templates — a host saves a night's reusable setup (everything except the
 * date) and starts future nights from it. Runs under the authed server client so
 * RLS scopes everything to the host. See `supabase/game night-templates.sql`.
 * Guarded reads so an unapplied migration degrades to "no templates".
 */

import { createClient } from "@/lib/supabase/server";
import { getNight } from "./store";
import type { NightGame } from "./types";

export interface NightTemplateData {
  title?: string;
  description?: string | null;
  place?: string | null;
  capacity?: number | null;
  visibility?: "public" | "unlisted";
  genres?: string[] | null;
  level?: string | null;
  games?: NightGame[];
}

export interface NightTemplate {
  id: string;
  name: string;
  data: NightTemplateData;
  created_at: string;
}

interface Row {
  id: string;
  name: string;
  data: NightTemplateData | null;
  created_at: string;
}

export async function listTemplates(): Promise<NightTemplate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("board_game_night_templates")
    .select("id, name, data, created_at")
    .order("created_at", { ascending: false });
  if (error) return [];
  return ((data ?? []) as Row[]).map((r) => ({ id: r.id, name: r.name, data: r.data ?? {}, created_at: r.created_at }));
}

export async function getTemplate(id: string): Promise<NightTemplate | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("board_game_night_templates")
    .select("id, name, data, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const r = data as Row;
  return { id: r.id, name: r.name, data: r.data ?? {}, created_at: r.created_at };
}

export async function createTemplate(
  name: string,
  data: NightTemplateData,
): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };
  const { data: row, error } = await supabase
    .from("board_game_night_templates")
    .insert({ host_id: user.id, name: name.trim().slice(0, 120) || "Untitled template", data })
    .select("id")
    .single();
  if (error) return { error: error.message };
  return { id: row.id as string };
}

/** Save an existing night's setup (minus its date) as a reusable template. */
export async function createTemplateFromNight(
  nightId: string,
  name?: string,
): Promise<{ id: string } | { error: string }> {
  const night = await getNight(nightId);
  if (!night) return { error: "Night not found." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || night.host_id !== user.id) return { error: "Not your night." };
  const data: NightTemplateData = {
    title: night.title,
    description: night.description,
    place: night.place,
    capacity: night.capacity,
    visibility: night.visibility,
    genres: night.genres,
    level: night.level,
    games: night.games,
  };
  return createTemplate(name?.trim() || night.title, data);
}

export async function deleteTemplate(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("board_game_night_templates").delete().eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}
