import "server-only";

/**
 * What a board row says about a time besides Verified (round 3, picks 2026-11-01 SvB3SNRyxT9RzFzgBjvKGN):
 *   Under review (3A)  a report is open on it (flags the site opens itself don't count: they never show publicly)
 *   Trusted (7A)       its player has TRUSTED_AFTER checked clips, none turned down and no time removed after a report,
 *                      and nothing of theirs is under review; their top-ten times skip the clip
 *   vouches            who vouched for it (anyone signed in since 2026-11-04; ten = Community verified)
 *   country (6A)       the player's country, for the country filter and national records
 * Each read is one query for the rows shown. Everything here needs time-trials-m4.sql (`round3Ready`); before it
 * runs the reads come back empty.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { TRUSTED_AFTER } from "./rules";

const OPEN = ["open", "waiting_owner", "waiting_review"];

let ready: { at: number; ok: boolean } | null = null;
/** Whether time-trials-m4.sql has run (kept for a minute either way). */
export async function round3Ready(): Promise<boolean> {
  if (ready && Date.now() - ready.at < 60_000) return ready.ok;
  const { error } = await createServiceClient().from("tt_vouches").select("time_id").limit(1);
  ready = { at: Date.now(), ok: !error };
  return ready.ok;
}

let ready4: { at: number; ok: boolean } | null = null;
/** Whether time-trials-m5.sql has run: the account country, the Top 10 sheets and claims (kept for a minute either way). */
export async function round4Ready(): Promise<boolean> {
  if (ready4 && Date.now() - ready4.at < 60_000) return ready4.ok;
  const { error } = await createServiceClient().from("tt_claims").select("id").limit(1);
  ready4 = { at: Date.now(), ok: !error };
  return ready4.ok;
}

/** Times with an open report (not a flag). */
export async function underReview(timeIds: string[]): Promise<Set<string>> {
  if (!timeIds.length) return new Set();
  const m4 = await round3Ready();
  let q = createServiceClient().from("tt_reports").select("time_id").in("time_id", timeIds).in("state", OPEN);
  if (m4) q = q.eq("kind", "report");
  const { data } = await q;
  return new Set(((data ?? []) as { time_id: string }[]).map((r) => r.time_id));
}

/** Players who've earned Trusted. */
export async function trustedPlayers(players: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  const uniq = [...new Set(players)];
  if (!uniq.length) return out;
  const db = createServiceClient();
  const [{ data: clips }, { data: reports }] = await Promise.all([
    db.from("tt_times").select("player, video_status").in("player", uniq).in("video_status", ["checked", "rejected"]).limit(5000),
    db.from("tt_reports").select("state, tt_times!inner(player)").in("tt_times.player", uniq).in("state", [...OPEN, "removed"]).limit(2000),
  ]);
  const checked = new Map<string, number>();
  const out_ = new Set<string>();
  for (const r of (clips ?? []) as { player: string; video_status: string }[]) {
    if (r.video_status === "rejected") out_.add(r.player);
    else checked.set(r.player, (checked.get(r.player) ?? 0) + 1);
  }
  for (const r of (reports ?? []) as unknown as { state: string; tt_times: { player: string } }[]) out_.add(r.tt_times.player);
  for (const [p, n] of checked) if (n >= TRUSTED_AFTER && !out_.has(p)) out.add(p);
  return out;
}

export async function isTrusted(player: string): Promise<boolean> {
  return (await trustedPlayers([player])).has(player);
}

/** How many players vouched for each time. */
export async function vouchCounts(timeIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!timeIds.length || !(await round3Ready())) return out;
  const { data } = await createServiceClient().from("tt_vouches").select("time_id").in("time_id", timeIds).limit(5000);
  for (const r of (data ?? []) as { time_id: string }[]) out.set(r.time_id, (out.get(r.time_id) ?? 0) + 1);
  return out;
}

/** Each player's country (players without one are left out). */
export async function countriesFor(players: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const uniq = [...new Set(players)];
  if (!uniq.length || !(await round3Ready())) return out;
  const { data } = await createServiceClient().from("tt_player_country").select("player, country").in("player", uniq);
  for (const r of (data ?? []) as { player: string; country: string }[]) out.set(r.player, r.country);
  return out;
}
