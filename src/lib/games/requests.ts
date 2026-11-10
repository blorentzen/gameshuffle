import "server-only";

/**
 * "Don't see your game?" on /games (spaces first wave, 2026-11-09): a signed-in person names a game to ask for its
 * space. One ask per account per game (the catalog key when the catalog knows it, else the typed name lowercased),
 * through the word filter, rate limited by the route. Staff see the most asked for, with counts, on Platform ▸ Library
 * ▸ Game catalog. Table and count function in supabase/ideas-game-m1.sql; until it runs the line hides and the admin
 * list says so.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { catalogGame } from "@/data/game-catalog";
import { isBlockedText } from "@/lib/text/filter";
import { spaceFor, spaceOpen, spacePath } from "./spaces";
import { gsDay } from "@/lib/time/gsClock";

export const ASK_NAME_MAX = 60;

let readyAt = 0;
/** Whether game_space_requests exists (asked again after a minute when it doesn't). */
export async function spaceRequestsReady(): Promise<boolean> {
  if (readyAt > 0) return true;
  if (readyAt < 0 && Date.now() + readyAt < 60_000) return false;
  // A plain one-row read: a HEAD request to a missing table comes back without an error body.
  const { error } = await createServiceClient().from("game_space_requests").select("id").limit(1);
  readyAt = error ? -Date.now() : Date.now();
  return !error;
}

/** One line of whitespace, the way it's shown. */
const tidy = (name: string) => name.normalize("NFC").replace(/\s+/g, " ").trim();

export type AskResult =
  | { ok: true; already: boolean; name: string }
  | { ok: true; space: { href: string; name: string } }
  | { ok: false; error: "invalid" | "blocked" | "not_ready" | "failed" };

export async function askForSpace(userId: string, typed: string): Promise<AskResult> {
  const name = tidy(typed ?? "");
  if (name.length < 2 || name.length > ASK_NAME_MAX) return { ok: false, error: "invalid" };
  if (isBlockedText(name)) return { ok: false, error: "blocked" };
  const entry = catalogGame(name);
  // A game whose space is already open: send them there instead of counting an ask.
  const open = entry ? spaceFor(entry.slug) : null;
  if (open && spaceOpen(open, gsDay())) return { ok: true, space: { href: spacePath(open), name: open.name } };
  if (!(await spaceRequestsReady())) return { ok: false, error: "not_ready" };
  const row = entry
    ? { user_id: userId, game_key: entry.slug, game_name: entry.name, in_catalog: true }
    : { user_id: userId, game_key: name.toLowerCase().slice(0, 80), game_name: name, in_catalog: false };
  const { error } = await createServiceClient().from("game_space_requests").insert(row);
  if (error?.code === "23505") return { ok: true, already: true, name: row.game_name };
  if (error) {
    if (error.code === "42P01") readyAt = -Date.now();
    else console.error("[spaces] space ask failed:", error);
    return { ok: false, error: error.code === "42P01" ? "not_ready" : "failed" };
  }
  return { ok: true, already: false, name: row.game_name };
}

export interface SpaceAsk { key: string; name: string; inCatalog: boolean; asks: number; lastAsked: string }

/** The most asked for (staff), or null before the migration. */
export async function spaceAsks(limit = 100): Promise<SpaceAsk[] | null> {
  if (!(await spaceRequestsReady())) return null;
  const { data, error } = await createServiceClient().rpc("game_space_request_counts", { p_limit: limit });
  if (error) return null;
  return ((data ?? []) as { game_key: string; game_name: string; in_catalog: boolean; asks: number; last_asked: string }[])
    .map((r) => ({ key: r.game_key, name: r.game_name, inCatalog: r.in_catalog, asks: Number(r.asks), lastAsked: r.last_asked }));
}
