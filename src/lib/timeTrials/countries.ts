import "server-only";

/**
 * A country for each time trial player (round 3 pick 6A, time-trials-m4.sql `tt_player_country`): filled in from
 * their confirmed lounge name or the MKCentral import when we can, else they pick it once on their player page.
 * Players without one just don't show on country boards. A country the player picked wins over one filled in.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { flagUrl } from "@/lib/lounge/flags";
import { round3Ready } from "./status";
import type { TtPlayer } from "./rules";

export const isCountryCode = (v: unknown): v is string => typeof v === "string" && /^[a-z]{2}$/.test(v) && !!flagUrl(v);

export async function countryOf(player: string): Promise<{ country: string; source: string } | null> {
  if (!(await round3Ready())) return null;
  const { data } = await createServiceClient().from("tt_player_country").select("country, source").eq("player", player).maybeSingle();
  return (data as { country: string; source: string } | null) ?? null;
}

/** The player picks their country (or clears it). */
export async function pickCountry(player: TtPlayer, country: string | null): Promise<boolean> {
  if (!(await round3Ready())) return false;
  const db = createServiceClient();
  if (!country) { await db.from("tt_player_country").delete().eq("player", player); return true; }
  if (!isCountryCode(country)) return false;
  const { error } = await db.from("tt_player_country").upsert({ player, country, source: "picked", updated_at: new Date().toISOString() }, { onConflict: "player" });
  return !error;
}

/** Fills in a country found elsewhere, unless the player already has one. */
export async function noteCountry(player: string, country: string | null | undefined, source: "mkcentral" | "lounge"): Promise<void> {
  const c = country?.trim().toLowerCase();
  if (!c || !isCountryCode(c) || !(await round3Ready())) return;
  await createServiceClient().from("tt_player_country").upsert({ player, country: c, source, updated_at: new Date().toISOString() }, { onConflict: "player", ignoreDuplicates: true });
}

/** An account player's country from their confirmed lounge name, when they have none yet. */
export async function fillFromLounge(player: string): Promise<string | null> {
  if (!player.startsWith("u:") || !(await round3Ready())) return null;
  const have = await countryOf(player);
  if (have) return have.country;
  const { data } = await createServiceClient().from("lounge_links").select("country").eq("user_id", player.slice(2)).not("country", "is", null).limit(1).maybeSingle();
  const c = (data as { country: string | null } | null)?.country ?? null;
  if (c) await noteCountry(player, c, "lounge");
  return c?.toLowerCase() ?? null;
}

/** Everyone with this country (a board's country filter). */
export async function countryPlayers(country: string): Promise<string[]> {
  if (!isCountryCode(country) || !(await round3Ready())) return [];
  const { data } = await createServiceClient().from("tt_player_country").select("player").eq("country", country).limit(5000);
  return ((data ?? []) as { player: string }[]).map((r) => r.player);
}

/** The countries that have at least one player with a country (the filter's choices), most players first. */
export async function countriesInUse(): Promise<{ country: string; players: number }[]> {
  if (!(await round3Ready())) return [];
  const { data } = await createServiceClient().from("tt_player_country").select("country").limit(10_000);
  const n = new Map<string, number>();
  for (const r of (data ?? []) as { country: string }[]) n.set(r.country, (n.get(r.country) ?? 0) + 1);
  return [...n].map(([country, players]) => ({ country, players })).sort((a, b) => b.players - a.players || a.country.localeCompare(b.country));
}
