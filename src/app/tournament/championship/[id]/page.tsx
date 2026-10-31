import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/admin";
import { getGameName } from "@/data/game-registry";
import { previewText, shareMeta } from "@/lib/og/meta";
import { createClient } from "@/lib/supabase/server";
import { getBaseUrl } from "@/lib/env";
import { listMembers, type Championship } from "@/lib/championships";
import { loadChampionshipOwner } from "@/lib/tournaments/organizers";
import type { HeatMains } from "@/lib/tournaments/heatMains";
import { safeTimeZone } from "@/lib/time/gsClock";
import { ChampionshipPublicClient, type ChampionshipInitial } from "./ChampionshipPublicClient";

type Row = { name: string; description: string | null; game_slug: string; settings: { game_label?: string } | null; status: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The season, null when there's no such season, undefined when the lookup failed (a hiccup shouldn't 404). */
const loadSeason = cache(async (id: string): Promise<Row | null | undefined> => {
  if (!UUID.test(id)) return null;
  try {
    const { data, error } = await createServiceClient()
      .from("championships")
      .select("name, description, game_slug, settings, status")
      .eq("id", id)
      .maybeSingle();
    return error ? undefined : ((data as Row | null) ?? null);
  } catch {
    return undefined;
  }
});

// Public season page: metadata and the first paint on the server; the
// interactive season table and realtime live in the client component.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const data = await loadSeason(id);
  if (data === undefined) return { title: "Championship Series" };
  if (!data) return { title: "Championship not found", robots: { index: false, follow: false } };

  /* `settings.game_label` first, because a custom game's slug is a slugified
     version of whatever the organizer typed and getGameName returns it
     unchanged — so a Smash season advertised itself as
     "super-smash-bros-ultimate". The old `|| "Mario Kart"` fallback could
     never fire either, since a slug is always truthy. */
  const game = data.settings?.game_label || getGameName(data.game_slug);
  const title = `${data.name}: Championship Series`;
  const description = previewText(
    data.description?.trim() ||
    `Live season standings and events for ${data.name}, a ${game} championship series on GameShuffle.`,
  );

  return {
    title,
    description,
    // A finished season still loads by link but stops competing in search.
    ...(data.status === "archived" ? { robots: { index: false, follow: true } } : {}),
    ...shareMeta({ title, description, path: `/tournament/championship/${id}` }),
  };
}

/**
 * The first paint, read on the server so standings, events and roster are in
 * the HTML (link previews and search engines don't run the page's JavaScript).
 * Same reads as the browser, with the viewer's session.
 */
async function loadInitial(id: string): Promise<ChampionshipInitial | null> {
  const supabase = await createClient();
  const { data: champ } = await supabase.from("championships").select("*").eq("id", id).maybeSingle();
  if (!champ) return null;
  const [members, { data: evs }, owner] = await Promise.all([
    listMembers(supabase, id),
    supabase
      .from("tournaments")
      .select("id, title, status, event_number, date_time, heat_mains, tournament_participants(id, user_id)")
      .eq("championship_id", id)
      .order("event_number", { ascending: true }),
    loadChampionshipOwner(id).catch(() => null),
  ]);
  return {
    champ: champ as Championship,
    members,
    events: (evs ?? []).map((e) => ({
      id: e.id as string, title: e.title as string, status: e.status as string,
      event_number: (e.event_number as number | null) ?? null,
      dateTime: (e.date_time as string | null) ?? null,
      heat_mains: (e.heat_mains as HeatMains | null) ?? null,
      participants: ((e as { tournament_participants?: { id: string; user_id: string | null }[] }).tournament_participants ?? []),
    })),
    owner: owner ? { displayName: owner.displayName, username: owner.username } : null,
    timeZone: safeTimeZone(owner?.timeZone),
  };
}

export default async function ChampionshipPublicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if ((await loadSeason(id)) === null) notFound();
  const initial = await loadInitial(id).catch((err) => {
    console.error("[championship page] server read failed; the browser will load it", err);
    return null;
  });
  return <ChampionshipPublicClient initial={initial} baseUrl={getBaseUrl()} />;
}
