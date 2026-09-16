import "server-only";

/**
 * Recurring-series store + generator. Hosts create a series (via the "repeat"
 * option when hosting a night); the platform keeps ONE upcoming instance
 * materialized as a real board_game_nights row. Reads/writes of the series run
 * under the authed client (RLS host-scoped); instance generation uses the
 * service client so the cron sweep can materialize for any host. See
 * `supabase/board-game-night-series.sql`.
 */

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { geocodePlace } from "./geocode";
import { nextOccurrence, type Cadence } from "./seriesSchedule";
import type { NightTemplateData } from "./templates";

export interface NightSeries {
  id: string;
  host_id: string;
  name: string;
  cadence: Cadence;
  anchor_at: string;
  timezone: string | null;
  data: NightTemplateData;
  active: boolean;
  created_at: string;
}

export interface SeriesInput {
  name: string;
  cadence: Cadence;
  anchor_at: string;
  timezone?: string | null;
  data: NightTemplateData;
}

export async function createSeries(input: SeriesInput): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };
  const { data, error } = await supabase
    .from("board_game_night_series")
    .insert({
      host_id: user.id,
      name: input.name.trim().slice(0, 120) || "Recurring night",
      cadence: input.cadence,
      anchor_at: input.anchor_at,
      timezone: input.timezone ?? null,
      data: input.data,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  return { id: data.id as string };
}

export async function listSeries(): Promise<Array<NightSeries & { nextAt: string | null }>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("board_game_night_series")
    .select("id, host_id, name, cadence, anchor_at, timezone, data, active, created_at")
    .order("created_at", { ascending: false });
  if (error) return [];
  const now = new Date();
  return ((data ?? []) as NightSeries[]).map((s) => {
    const next = s.active ? nextOccurrence(new Date(s.anchor_at), s.cadence, now) : null;
    return { ...s, data: s.data ?? {}, nextAt: next ? next.toISOString() : null };
  });
}

export async function setSeriesActive(id: string, active: boolean): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("board_game_night_series")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function deleteSeries(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("board_game_night_series").delete().eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Load a single series via the authed client (RLS: own only). */
export async function getOwnSeries(id: string): Promise<NightSeries | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("board_game_night_series")
    .select("id, host_id, name, cadence, anchor_at, timezone, data, active, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const s = data as NightSeries;
  return { ...s, data: s.data ?? {} };
}

/**
 * Ensure the next instance exists for a series. Normally keeps exactly one
 * upcoming night materialized; `force` generates the one after the latest
 * existing instance (host-triggered "generate next"). Uses the service client.
 */
export async function materializeSeries(
  series: NightSeries,
  opts: { force?: boolean } = {},
): Promise<{ created: boolean; id?: string; at?: string }> {
  if (!series.active) return { created: false };
  const admin = createServiceClient();
  const now = new Date();

  const { data: rows } = await admin
    .from("board_game_nights")
    .select("starts_at")
    .eq("series_id", series.id)
    .not("starts_at", "is", null)
    .order("starts_at", { ascending: false });
  const starts = ((rows ?? []) as { starts_at: string }[]).map((r) => r.starts_at);
  const latest = starts.length ? new Date(starts[0]) : null;
  const hasFuture = !!latest && latest.getTime() > now.getTime();
  if (!opts.force && hasFuture) return { created: false };

  const afterMs = Math.max(opts.force && latest ? latest.getTime() : 0, now.getTime());
  const next = nextOccurrence(new Date(series.anchor_at), series.cadence, new Date(afterMs));
  if (!next) return { created: false };
  const nextIso = next.toISOString();

  // Dedup exact slot.
  const { data: dupe } = await admin
    .from("board_game_nights")
    .select("id")
    .eq("series_id", series.id)
    .eq("starts_at", nextIso)
    .limit(1);
  if (dupe?.length) return { created: false };

  const d = series.data ?? {};
  const place = d.place ?? null;
  const coords = await geocodePlace(place);
  const { data: created, error } = await admin
    .from("board_game_nights")
    .insert({
      host_id: series.host_id,
      series_id: series.id,
      title: d.title ?? series.name,
      description: d.description ?? null,
      place,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      starts_at: nextIso,
      timezone: series.timezone ?? null,
      capacity: d.capacity ?? null,
      visibility: d.visibility ?? "public",
      genres: d.genres?.length ? d.genres : null,
      level: d.level || null,
      games: d.games ?? [],
      status: "scheduled",
    })
    .select("id")
    .single();
  if (error || !created) return { created: false };
  return { created: true, id: created.id as string, at: nextIso };
}

/** Cron sweep: materialize the next instance for every active series. */
export async function sweepSeries(): Promise<{ created: number }> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("board_game_night_series")
    .select("id, host_id, name, cadence, anchor_at, timezone, data, active, created_at")
    .eq("active", true);
  let created = 0;
  for (const s of ((data ?? []) as NightSeries[])) {
    const res = await materializeSeries({ ...s, data: s.data ?? {} }).catch(() => ({ created: false }));
    if (res.created) created += 1;
  }
  return { created };
}
