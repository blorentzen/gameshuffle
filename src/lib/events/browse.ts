import "server-only";

import { createServiceClient } from "@/lib/supabase/admin";
import { getGameName } from "@/data/game-registry";
import type { BrowseEvent } from "@/components/events/EventsBrowser";

/**
 * Row loaders for the shared EventsBrowser. Both hubs (and each other's
 * cross-rail) read through these so the card data is shaped once.
 *
 * Service client: browse rows are public by definition (public nights,
 * non-draft tournaments) and must not blank out under a viewer's RLS.
 * Windows: a bounded upcoming set plus the recent past, so the browser's
 * "When" filter has something to show for Past without paging.
 */

const PAST_DAYS = 30;
const DEFAULT_LIMIT = 200;

/**
 * Cheapest live ticket per event, in one query for the whole page of rows.
 * An event with no active tier is free, which is the common case, so a missing
 * entry means free rather than unknown.
 */
export async function lowestPrices(type: "tournament" | "game-night", eventIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (eventIds.length === 0) return out;
  const { data, error } = await createServiceClient()
    .from("gs_ticket_tiers").select("event_id, amount_cents").eq("event_type", type).eq("active", true).in("event_id", eventIds);
  if (error) return out; // pre-migration → every event is free
  for (const r of (data ?? []) as { event_id: string; amount_cents: number }[]) {
    const cur = out.get(r.event_id);
    if (cur == null || r.amount_cents < cur) out.set(r.event_id, r.amount_cents);
  }
  return out;
}

const FORMAT_LABEL: Record<string, string> = {
  ffa_points: "Points",
  single_elim: "Single elim",
  double_elim: "Double elim",
  heat_mains: "Heat → Mains",
  round_robin: "Round robin",
};

export async function loadNightRows(limit = DEFAULT_LIMIT): Promise<BrowseEvent[]> {
  const svc = createServiceClient();
  const since = new Date(Date.now() - PAST_DAYS * 86_400_000).toISOString();
  const { data } = await svc
    .from("board_game_nights")
    .select("id, title, starts_at, timezone, place, lat, lng, cover_image_url, kind, level, genres, games, status, capacity, host_id")
    .eq("visibility", "public")
    .in("status", ["scheduled", "cancelled"])
    .or(`starts_at.gte.${since},starts_at.is.null`)
    .order("starts_at", { ascending: true, nullsFirst: false })
    .limit(limit);
  const rows = (data ?? []) as {
    id: string; title: string; starts_at: string | null; timezone: string | null; place: string | null; lat: number | null; lng: number | null;
    cover_image_url: string | null; kind: string | null; level: string | null; genres: string[] | null; games: { length?: string | null }[] | null; status: string; capacity: number | null; host_id: string;
  }[];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const hostIds = [...new Set(rows.map((r) => r.host_id))];
  const [{ data: rsvps }, { data: hosts }, prices] = await Promise.all([
    svc.from("board_game_night_rsvps").select("night_id").in("night_id", ids).eq("status", "going"),
    svc.from("users").select("id, display_name, username").in("id", hostIds),
    lowestPrices("game-night", ids),
  ]);
  const going = new Map<string, number>();
  for (const r of (rsvps ?? []) as { night_id: string }[]) going.set(r.night_id, (going.get(r.night_id) ?? 0) + 1);
  const hostName = new Map((hosts ?? []).map((h) => [h.id as string, (h.display_name as string | null) || (h.username as string | null)]));
  const now = Date.now();

  return rows.map((n) => ({
    type: "game-night",
    id: n.id,
    href: `/game-nights/${n.id}`,
    title: n.title,
    starts_at: n.starts_at,
    timezone: n.timezone,
    place: n.place,
    lat: n.lat,
    lng: n.lng,
    online: false,
    cover: n.cover_image_url,
    kind: n.kind ?? "board",
    level: n.level,
    genres: n.genres ?? [],
    gameLengths: [...new Set((n.games ?? []).map((g) => g.length).filter((l): l is string => !!l))],
    gameCount: (n.games ?? []).length,
    game: null,
    tags: [],
    phase: n.status === "cancelled" ? "cancelled" : n.starts_at && Date.parse(n.starts_at) < now ? "past" : "upcoming",
    status: null,
    goingCount: going.get(n.id) ?? 0,
    priceFromCents: prices.get(n.id) ?? null,
    capacity: n.capacity,
    organizer: hostName.get(n.host_id) ?? null,
  }));
}

export async function loadTournamentRows(limit = DEFAULT_LIMIT): Promise<BrowseEvent[]> {
  const svc = createServiceClient();
  const since = new Date(Date.now() - PAST_DAYS * 86_400_000).toISOString();
  const base = "id, title, game_slug, mode, format, status, date_time, max_participants, header_image_url, settings, organizer_id";
  const run = (cols: string) =>
    svc
      .from("tournaments")
      .select(cols)
      .in("status", ["open", "in_progress", "complete", "cancelled"])
      .or(`date_time.gte.${since},date_time.is.null`)
      .order("date_time", { ascending: true, nullsFirst: false })
      .limit(limit);
  // Guarded: `lat`/`lng` arrive with tournament-location-m1.sql; fall back without them.
  let res = await run(`${base}, lat, lng`);
  if (res.error) res = await run(base);
  const data = res.data as unknown;
  const rows = ((data as unknown[]) ?? []) as {
    id: string; title: string; game_slug: string; mode: string; format: string | null; status: string; date_time: string | null; max_participants: number | null;
    header_image_url: string | null; settings: { game_label?: string; locationType?: string; location?: string | null; requireVerified?: boolean } | null; organizer_id: string; lat?: number | null; lng?: number | null;
  }[];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const orgIds = [...new Set(rows.map((r) => r.organizer_id))];
  const [{ data: parts }, { data: orgs }, prices] = await Promise.all([
    svc.from("tournament_participants").select("tournament_id").in("tournament_id", ids).neq("status", "dropped"),
    svc.from("users").select("id, display_name, username").in("id", orgIds),
    lowestPrices("tournament", ids),
  ]);
  const count = new Map<string, number>();
  for (const p of (parts ?? []) as { tournament_id: string }[]) count.set(p.tournament_id, (count.get(p.tournament_id) ?? 0) + 1);
  const orgName = new Map((orgs ?? []).map((o) => [o.id as string, (o.display_name as string | null) || (o.username as string | null)]));

  return rows.map((t) => {
    const inPerson = t.settings?.locationType === "in_person";
    return {
      type: "tournament",
      id: t.id,
      href: `/tournament/${t.id}`,
      title: t.title,
      starts_at: t.date_time,
      timezone: null,
      place: inPerson ? (t.settings?.location ?? "In person") : null,
      lat: inPerson ? (t.lat ?? null) : null,
      lng: inPerson ? (t.lng ?? null) : null,
      online: !inPerson,
      cover: t.header_image_url ?? null,
      kind: null,
      level: null,
      genres: [],
      gameLengths: [],
      gameCount: 0,
      game: t.settings?.game_label || getGameName(t.game_slug),
      tags: [t.format ? FORMAT_LABEL[t.format] ?? t.format : null, t.mode?.toUpperCase() ?? null, t.settings?.requireVerified ? "Verified only" : null].filter((x): x is string => !!x),
      phase: t.status === "cancelled" ? "cancelled" : t.status === "complete" ? "past" : t.status === "in_progress" ? "live" : "upcoming",
      status: (t.status as BrowseEvent["status"]) ?? null,
      goingCount: count.get(t.id) ?? 0,
      priceFromCents: prices.get(t.id) ?? null,
      capacity: t.max_participants,
      organizer: orgName.get(t.organizer_id) ?? null,
    };
  });
}
