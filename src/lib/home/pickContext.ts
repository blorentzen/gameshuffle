import "server-only";

/**
 * What's yours, for the pictures on the picks after the dailies (context picks 2026-11-05, 1A and 2A,
 * https://claude.ai/artifact/APK5x7mRj9Ldvt7a8J7g4T): a Pokémon card from your collection (a favorite first), your
 * best time trial track (its course art, as an inset), your saved kart build (character and kart, as an inset), and
 * your friends' faces for a night with friends. Every read is guarded: a missing one falls back to the game's art.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { playerBests } from "@/lib/timeTrials/store";
import { ttTrack, trackPath, TT_GAMES } from "@/lib/timeTrials/tracks";
import { formatTime, ttPlayer } from "@/lib/timeTrials/rules";

export interface PickContext {
  /** A Pokémon card you own: its art window only, credited. */
  card: { src: string; fullArt: boolean; name: string; credit: string; count: number } | null;
  /** Your best time trial: the board you place highest on that has course art. */
  best: { track: string; image: string; time: string; place: number; total: number; href: string; game: string } | null;
  /** Your newest saved kart build. */
  build: { character: { name: string; img: string }; vehicle: { name: string; img: string }; href: string } | null;
  /** Friends (you follow each other) for a night's faces and "Save seats for …". */
  friends: { name: string; avatar: string | null }[];
}

export const NO_CONTEXT: PickContext = { card: null, best: null, build: null, friends: [] };

type CardRow = { card: CardJoin | CardJoin[] | null };
type CardJoin = { name: string; supertype: string | null; rarity: string | null; images: { small?: string; medium?: string } | null; image_medium_path: string | null; expansion: { name: string | null } | { name: string | null }[] | null };

async function yourCard(userId: string): Promise<PickContext["card"]> {
  const db = createServiceClient();
  const [{ data }, count] = await Promise.all([
    db.from("gs_user_cards").select("card:tcg_cards(name, supertype, rarity, images, image_medium_path, expansion:tcg_expansions(name))")
      .eq("user_id", userId).order("showcased_at", { ascending: false, nullsFirst: false }).order("added_at", { ascending: false }).limit(24),
    db.from("gs_user_cards").select("id", { count: "exact", head: true }).eq("user_id", userId).then((r) => r.count ?? 0),
  ]);
  for (const row of (data ?? []) as CardRow[]) {
    const c = Array.isArray(row.card) ? row.card[0] : row.card;
    // Pokémon only: a Trainer or Energy card's art window says nothing about "Name every Pokémon".
    if (!c || !(c.supertype ?? "").toLowerCase().startsWith("pok")) continue;
    const src = c.images?.medium ?? c.image_medium_path ?? c.images?.small;
    if (!src) continue;
    const exp = Array.isArray(c.expansion) ? c.expansion[0] : c.expansion;
    return { src, name: c.name, count, fullArt: /illustration|art rare|gallery|character/i.test(c.rarity ?? ""), credit: `${c.name}${exp?.name ? `, ${exp.name}` : ""}` };
  }
  return null;
}

async function yourBest(userId: string): Promise<PickContext["best"]> {
  const bests = await playerBests(ttPlayer("u", userId));
  // The open board (any vehicle) you place highest on, with course art to show.
  const b = bests.find((x) => x.vehicle === "any" && ttTrack(x.game, x.track)?.image) ?? bests.find((x) => ttTrack(x.game, x.track)?.image);
  if (!b) return null;
  const t = ttTrack(b.game, b.track)!;
  return { track: t.name, image: t.image!, time: formatTime(b.timeMs), place: b.place, total: b.total, href: trackPath(t, b.cc, { items: b.items, vehicle: b.vehicle }), game: TT_GAMES[b.game].short };
}

type ConfigRow = { id: string; randomizer_slug: string | null; config_data: { type?: string; character?: { name?: string; img?: string }; vehicle?: { name?: string; img?: string } } | null };

async function yourBuild(userId: string): Promise<PickContext["build"]> {
  const { data } = await createServiceClient().from("saved_configs").select("id, randomizer_slug, config_data")
    .eq("user_id", userId).order("created_at", { ascending: false }).limit(30);
  const row = ((data ?? []) as ConfigRow[]).find((r) => r.config_data?.type === "kart-build" && r.config_data.character?.img && r.config_data.vehicle?.img && r.randomizer_slug);
  if (!row) return null;
  const d = row.config_data!;
  return {
    character: { name: d.character!.name ?? "Your racer", img: d.character!.img! },
    vehicle: { name: d.vehicle!.name ?? "your kart", img: d.vehicle!.img! },
    href: `/randomizers/${row.randomizer_slug}?config=${row.id}`,
  };
}

/** `friends` come from the Today pulse (it already reads them), so this doesn't read follows twice. */
export async function pickContext(userId: string, friends: PickContext["friends"] = []): Promise<PickContext> {
  const [card, best, build] = await Promise.all([
    yourCard(userId).catch(() => null),
    yourBest(userId).catch(() => null),
    yourBuild(userId).catch(() => null),
  ]);
  return { card, best, build, friends: friends.slice(0, 3) };
}
