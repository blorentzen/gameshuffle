import "server-only";

/**
 * A country for each time trial player (round 3 pick 6A, time-trials-m4.sql `tt_player_country`). Round 4 (picks
 * 2026-11-04, time-trials-m5.sql): an account has one country (`users.country`), set from the profile's place search,
 * the time trials pages, the add form or /tt country, and its time trials country follows it (source 'account').
 * Players without an account pick one with /tt country. Filled in when we can: the account's country, a confirmed
 * lounge name, MKCentral's registry (by Discord id) and the Top 10 sheets' country tables. A country someone picked
 * wins over one filled in. Players without one don't show on country boards; they're asked once on each surface.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { readAllPages } from "@/lib/supabase/pages";
import { flagUrl } from "@/lib/lounge/flags";
import { round3Ready, round4Ready } from "./status";
import { mkcentralCountry } from "./mkcentralImport";
import type { TtPlayer } from "./rules";

export const isCountryCode = (v: unknown): v is string => typeof v === "string" && /^[a-z]{2}$/.test(v) && !!flagUrl(v);

type FilledSource = "mkcentral" | "lounge" | "sheet";

export async function countryOf(player: string): Promise<{ country: string; source: string } | null> {
  if (!(await round3Ready())) return null;
  const { data } = await createServiceClient().from("tt_player_country").select("country, source").eq("player", player).maybeSingle();
  return (data as { country: string; source: string } | null) ?? null;
}

let acctReady: { at: number; ok: boolean } | null = null;
/** Whether `users.country` exists (time-trials-m5.sql), kept for a minute either way. */
export async function accountCountryReady(): Promise<boolean> {
  if (acctReady && Date.now() - acctReady.at < 60_000) return acctReady.ok;
  const { error } = await createServiceClient().from("users").select("country").limit(1);
  acctReady = { at: Date.now(), ok: !error };
  return acctReady.ok;
}

/** An account's one country, or null (none yet, or before time-trials-m5.sql). */
export async function accountCountry(userId: string): Promise<string | null> {
  if (!(await accountCountryReady())) return null;
  const { data } = await createServiceClient().from("users").select("country").eq("id", userId).maybeSingle();
  return (data as { country: string | null } | null)?.country ?? null;
}

/** Sets or clears an account's one country, and its time trials country with it. */
export async function setAccountCountry(userId: string, country: string | null): Promise<boolean> {
  if (country && !isCountryCode(country)) return false;
  const db = createServiceClient();
  const acct = await accountCountryReady();
  if (acct) {
    const { error } = await db.from("users").update({ country }).eq("id", userId);
    if (error) { console.error("[tt] account country:", error.message); return false; }
  }
  if (!(await round3Ready())) return acct;
  const player = `u:${userId}`;
  if (!country) { await db.from("tt_player_country").delete().eq("player", player); return true; }
  const source = (await round4Ready()) ? "account" : "picked";
  const { error } = await db.from("tt_player_country").upsert({ player, country, source, updated_at: new Date().toISOString() }, { onConflict: "player" });
  return !error;
}

/** The player picks their country (or clears it). An account's pick is its one country. */
export async function pickCountry(player: TtPlayer, country: string | null): Promise<boolean> {
  if (player.startsWith("u:")) return setAccountCountry(player.slice(2), country);
  if (!(await round3Ready())) return false;
  const db = createServiceClient();
  if (!country) { await db.from("tt_player_country").delete().eq("player", player); return true; }
  if (!isCountryCode(country)) return false;
  const { error } = await db.from("tt_player_country").upsert({ player, country, source: "picked", updated_at: new Date().toISOString() }, { onConflict: "player" });
  return !error;
}

/** Fills in a country found elsewhere, unless the player already has one. An account without a country gets it too. */
export async function noteCountry(player: string, country: string | null | undefined, source: FilledSource): Promise<void> {
  const c = country?.trim().toLowerCase();
  if (!c || !isCountryCode(c) || !(await round3Ready())) return;
  if (source === "sheet" && !(await round4Ready())) return;
  const db = createServiceClient();
  await db.from("tt_player_country").upsert({ player, country: c, source, updated_at: new Date().toISOString() }, { onConflict: "player", ignoreDuplicates: true });
  if (player.startsWith("u:") && (await accountCountryReady())) await db.from("users").update({ country: c }).eq("id", player.slice(2)).is("country", null);
}

/** An account player's country: the account's own, else a confirmed lounge name's (filled in the first time). */
export async function fillFromLounge(player: string): Promise<string | null> {
  if (!player.startsWith("u:") || !(await round3Ready())) return null;
  const have = await countryOf(player);
  if (have) return have.country;
  const own = await accountCountry(player.slice(2));
  if (own) { await setAccountCountry(player.slice(2), own); return own; }
  const { data } = await createServiceClient().from("lounge_links").select("country").eq("user_id", player.slice(2)).not("country", "is", null).limit(1).maybeSingle();
  const c = (data as { country: string | null } | null)?.country ?? null;
  if (c) await noteCountry(player, c, "lounge");
  return c?.toLowerCase() ?? null;
}

/** Everyone with this country (a board's country filter). */
export async function countryPlayers(country: string): Promise<string[]> {
  if (!isCountryCode(country) || !(await round3Ready())) return [];
  const db = createServiceClient();
  const { data } = await readAllPages<{ player: string }>((from, to) => db.from("tt_player_country").select("player").eq("country", country).order("player").range(from, to));
  return data.map((r) => r.player);
}

/** The countries that have at least one player with a country (the filter's choices), most players first. */
export async function countriesInUse(): Promise<{ country: string; players: number }[]> {
  if (!(await round3Ready())) return [];
  const db = createServiceClient();
  const { data } = await readAllPages<{ country: string }>((from, to) => db.from("tt_player_country").select("country, player").order("player").range(from, to));
  const n = new Map<string, number>();
  for (const r of data) n.set(r.country, (n.get(r.country) ?? 0) + 1);
  return [...n].map(([country, players]) => ({ country, players })).sort((a, b) => b.players - a.players || a.country.localeCompare(b.country));
}

// ── Asking once ───────────────────────────────────────────────────────────────

export type AskSurface = "site" | "discord";

/** Whether this player still needs asking for a country on this surface: no country, and not asked there yet. */
export async function shouldAskCountry(player: string, surface: AskSurface): Promise<boolean> {
  if (!(await round4Ready())) return false;
  const db = createServiceClient();
  const [have, asked] = await Promise.all([
    db.from("tt_player_country").select("player").eq("player", player).maybeSingle(),
    db.from("tt_country_asks").select("player").eq("player", player).eq("surface", surface).maybeSingle(),
  ]);
  return !have.data && !asked.data;
}

export async function noteAsked(player: string, surface: AskSurface): Promise<void> {
  if (!(await round4Ready())) return;
  await createServiceClient().from("tt_country_asks").upsert({ player, surface }, { onConflict: "player,surface", ignoreDuplicates: true });
}

// ── Filling in the ones we can (the daily sheet read runs this) ──────────────

/**
 * Players with times and no country, filled from what we already know: the account's country, a confirmed lounge
 * name, then MKCentral's registry by Discord id (at most `lookups` calls a run, so a big backlog spreads over days).
 */
export async function fillMissingCountries(opts: { lookups?: number } = {}): Promise<{ checked: number; filled: number }> {
  if (!(await round4Ready())) return { checked: 0, filled: 0 };
  const db = createServiceClient();
  const { data: rows } = await db.from("tt_times").select("player").eq("status", "ok").neq("source", "sheet").order("created_at", { ascending: false }).limit(5000);
  const players = [...new Set(((rows ?? []) as { player: string }[]).map((r) => r.player))];
  if (!players.length) return { checked: 0, filled: 0 };
  const { data: have } = await db.from("tt_player_country").select("player").in("player", players);
  const known = new Set(((have ?? []) as { player: string }[]).map((r) => r.player));
  // Random order, so the MKCentral lookups reach different players each day instead of the same first few.
  const missing = players.filter((p) => !known.has(p)).sort(() => Math.random() - 0.5);
  let filled = 0;
  let lookups = opts.lookups ?? 40;
  const users = missing.filter((p) => p.startsWith("u:")).map((p) => p.slice(2));
  const idents = missing.filter((p) => p.startsWith("i:")).map((p) => p.slice(2));
  const [acct, lounge, discordIds, identRows] = await Promise.all([
    users.length && (await accountCountryReady()) ? db.from("users").select("id, country, discord_id").in("id", users) : Promise.resolve({ data: [] }),
    users.length ? db.from("lounge_links").select("user_id, country").in("user_id", users).not("country", "is", null) : Promise.resolve({ data: [] }),
    users.length ? db.from("users").select("id, discord_id").in("id", users).not("discord_id", "is", null) : Promise.resolve({ data: [] }),
    idents.length ? db.from("gs_identities").select("id, platform, platform_id").in("id", idents).eq("platform", "discord") : Promise.resolve({ data: [] }),
  ]);
  const acctCountry = new Map(((acct.data ?? []) as { id: string; country: string | null }[]).filter((r) => r.country).map((r) => [r.id, r.country!]));
  const loungeCountry = new Map(((lounge.data ?? []) as { user_id: string; country: string }[]).map((r) => [r.user_id, r.country.toLowerCase()]));
  const discordOf = new Map<string, string>([
    ...((discordIds.data ?? []) as { id: string; discord_id: string }[]).map((r) => [`u:${r.id}`, r.discord_id] as [string, string]),
    ...((identRows.data ?? []) as { id: string; platform_id: string }[]).map((r) => [`i:${r.id}`, r.platform_id] as [string, string]),
  ]);
  for (const p of missing) {
    const id = p.slice(2);
    if (p.startsWith("u:") && acctCountry.has(id)) { await setAccountCountry(id, acctCountry.get(id)!); filled++; continue; }
    if (p.startsWith("u:") && loungeCountry.has(id)) { await noteCountry(p, loungeCountry.get(id), "lounge"); filled++; continue; }
    const discord = discordOf.get(p);
    if (discord && lookups > 0) {
      lookups--;
      const c = await mkcentralCountry(discord);
      if (c && isCountryCode(c)) { await noteCountry(p, c, "mkcentral"); filled++; }
    }
  }
  return { checked: missing.length, filled };
}
