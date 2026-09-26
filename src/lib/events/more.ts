import "server-only";

import { createServiceClient } from "@/lib/supabase/admin";
import type { EventType } from "./calendar";
import type { MoreEvent } from "./moreTypes";
import { lowestPrices } from "./browse";

export type { MoreEvent };

/**
 * "More from this organizer" — the organizer's other upcoming public events
 * (tournaments + game nights together), soonest first. Feeds the rail at the
 * bottom of the shared event shell. Service client: the rail is public data and
 * must not blank out when the viewer's RLS can't see the host's rows.
 */

export async function listMoreFromOrganizer(
  userId: string,
  exclude: { type: EventType; id: string },
  limit = 12,
): Promise<MoreEvent[]> {
  if (!userId) return [];
  const svc = createServiceClient();
  const nowIso = new Date().toISOString();

  const [t, n] = await Promise.all([
    svc
      .from("tournaments")
      .select("id, title, date_time, settings, status, header_image_url")
      .eq("organizer_id", userId)
      .in("status", ["open", "in_progress"])
      .gte("date_time", nowIso)
      .order("date_time", { ascending: true })
      .limit(limit + 1),
    svc
      .from("board_game_nights")
      .select("id, title, starts_at, place, status, visibility, cover_image_url")
      .eq("host_id", userId)
      .eq("status", "scheduled")
      .eq("visibility", "public")
      .gte("starts_at", nowIso)
      .order("starts_at", { ascending: true })
      .limit(limit + 1),
  ]);

  const out: MoreEvent[] = [
    ...((t.data ?? []) as { id: string; title: string; date_time: string | null; settings: { game_label?: string } | null; header_image_url?: string | null }[]).map((r) => ({
      type: "tournament" as const, id: r.id, title: r.title, startsAt: r.date_time, href: `/tournament/${r.id}`, subtitle: r.settings?.game_label ?? null, coverUrl: r.header_image_url ?? null, priceFromCents: null,
    })),
    ...((n.data ?? []) as { id: string; title: string; starts_at: string | null; place: string | null; cover_image_url?: string | null }[]).map((r) => ({
      type: "game-night" as const, id: r.id, title: r.title, startsAt: r.starts_at, href: `/game-nights/${r.id}`, subtitle: r.place, coverUrl: r.cover_image_url ?? null, priceFromCents: null,
    })),
  ]
    .filter((e) => !(e.type === exclude.type && e.id === exclude.id))
    .sort((a, b) => (a.startsAt ?? "").localeCompare(b.startsAt ?? ""));

  const picked = out.slice(0, limit);

  // Price is stated on every card, so the rail needs the same lowest-tier
  // lookup the browse grid uses. Split by type because tiers are keyed on
  // (event_type, event_id).
  const [tPrices, nPrices] = await Promise.all([
    lowestPrices("tournament", picked.filter((e) => e.type === "tournament").map((e) => e.id)),
    lowestPrices("game-night", picked.filter((e) => e.type === "game-night").map((e) => e.id)),
  ]);
  for (const e of picked) {
    e.priceFromCents = (e.type === "tournament" ? tPrices : nPrices).get(e.id) ?? null;
  }

  return picked;
}
