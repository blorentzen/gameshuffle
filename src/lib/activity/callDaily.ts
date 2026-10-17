/**
 * "Who's playing" on the Discord Activity's Daily (server only): everyone in
 * this call and how far they are with today's Daily, as squares only (like
 * the channel's results card), so nothing is spoiled.
 *
 * Who's in the call comes from Discord, not the page: the activity-instances
 * API lists the users connected to this instance (the session's confirmed
 * `ins`). Dev-preview rooms (`dev-…`) have no Discord instance, so they use the
 * play-together room's players instead.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import type { ActivitySession } from "@/lib/activity/session";
import { activityApp } from "@/lib/activity/discord";
import { facesFor } from "@/lib/discord/faces";
import { DEX_PUZZLE_ID, SHUFFLE, answerFor, hintFor, puzzleFor, type DailySchedule } from "@/lib/originals/daily";
import { gsDay } from "@/lib/time/gsClock";

const API = "https://discord.com/api/v10";
/** Calls are re-read at most this often per instance. */
const CACHE_MS = 10_000;

export interface CallDailyPlayer {
  id: string;
  name: string;
  avatar: string | null;
  me: boolean;
  status: "solved" | "out" | "playing" | "not_started";
  guesses: number;
  /** One row of squares per guess: match / close / miss. Empty for a result saved without its guesses. */
  rows: ("match" | "close" | "miss")[][];
}

const cache = new Map<string, { at: number; users: string[] }>();

/** The Discord users connected to this Activity instance, from Discord. */
async function instanceUsers(instanceId: string): Promise<string[] | null> {
  const hit = cache.get(instanceId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.users;
  const app = activityApp();
  if (!app?.botToken) return null;
  const res = await fetch(`${API}/applications/${app.clientId}/activity-instances/${encodeURIComponent(instanceId)}`, {
    headers: { Authorization: `Bot ${app.botToken}` },
  }).catch(() => null);
  if (!res?.ok) return null;
  const inst = (await res.json().catch(() => null)) as { users?: string[] } | null;
  const users = (inst?.users ?? []).filter((u) => /^\d{5,25}$/.test(u)).slice(0, 50);
  cache.set(instanceId, { at: Date.now(), users });
  return users;
}

/** gs_identities for everyone in the call. */
async function callIdentities(s: ActivitySession): Promise<string[]> {
  if (!s.ins) return [s.iid];
  const admin = createServiceClient();
  if (s.ins.startsWith("dev-")) {
    if (process.env.NODE_ENV !== "development") return [s.iid];
    const { data } = await admin.from("activity_room_players").select("identity_id").eq("instance_id", s.ins).limit(50);
    return [...new Set([s.iid, ...((data ?? []) as { identity_id: string }[]).map((r) => r.identity_id)])];
  }
  const users = await instanceUsers(s.ins);
  if (!users?.length) return [s.iid];
  const { data } = await admin.from("gs_identities").select("id, platform_id").eq("platform", "discord").in("platform_id", users);
  return [...new Set([s.iid, ...((data ?? []) as { id: string }[]).map((r) => r.id)])];
}

const cell = (s: string): "match" | "close" | "miss" => (s === "match" ? "match" : s === "close" ? "close" : "miss");

/** Everyone in this call and their daily today (the Shuffle, or the Dex), you first, then solved, playing, out, not started. */
export async function callDaily(s: ActivitySession, day: string = gsDay(), game: DailySchedule = SHUFFLE): Promise<CallDailyPlayer[]> {
  const ids = await callIdentities(s);
  const admin = createServiceClient();
  const [{ data }, faces] = await Promise.all([
    admin.from("daily_identity_results").select("identity_id, guess_list, guesses, solved, finished_at").eq("day", day).eq("puzzle", puzzleFor(day, game).id).in("identity_id", ids),
    facesFor(ids),
  ]);
  const rows = new Map(((data ?? []) as { identity_id: string; guess_list: string[] | null; guesses: number | null; solved: boolean | null; finished_at: string | null }[]).map((r) => [r.identity_id, r]));
  // Played on the website with a linked account instead: their account's result (no squares, just how it went).
  const missing = ids.filter((id) => !rows.has(id));
  const site = new Map<string, { guesses: number; solved: boolean }>();
  if (missing.length) {
    const { data: linked } = await admin.from("gs_identities").select("id, gs_account_id").in("id", missing).not("gs_account_id", "is", null);
    const byUser = new Map(((linked ?? []) as { id: string; gs_account_id: string }[]).map((r) => [r.gs_account_id, r.id]));
    if (byUser.size) {
      const base = admin.from("daily_results").select("user_id, guesses, solved").eq("day", day);
      const { data: results } = await (game.id === "dex" ? base.eq("puzzle", DEX_PUZZLE_ID) : base.neq("puzzle", DEX_PUZZLE_ID)).in("user_id", [...byUser.keys()]);
      for (const r of (results ?? []) as { user_id: string; guesses: number; solved: boolean }[]) {
        const id = byUser.get(r.user_id);
        if (id) site.set(id, { guesses: r.guesses, solved: r.solved });
      }
    }
  }
  const puzzle = puzzleFor(day, game);
  const answer = answerFor(day, game);
  const players: CallDailyPlayer[] = ids.map((id) => {
    const r = rows.get(id);
    const face = faces.get(id);
    const list = r?.guess_list ?? [];
    const web = site.get(id);
    if (!r && web) {
      return { id, name: face?.name || "A player", avatar: face?.avatar ?? null, me: id === s.iid, status: web.solved ? "solved" : "out", guesses: web.guesses, rows: [] };
    }
    return {
      id,
      name: face?.name || (id === s.iid ? s.name : "A player"),
      avatar: face?.avatar ?? null,
      me: id === s.iid,
      status: !r ? "not_started" : r.finished_at ? (r.solved ? "solved" : "out") : list.length ? "playing" : "not_started",
      guesses: r?.guesses ?? list.length,
      rows: list.map((g) => hintFor(g, answer, puzzle)?.cells.map((c) => cell(c.status)) ?? []).filter((row) => row.length),
    };
  });
  const rank = (p: CallDailyPlayer) => (p.me ? 0 : p.status === "solved" ? 1 : p.status === "playing" ? 2 : p.status === "out" ? 3 : 4);
  return players.sort((a, b) => rank(a) - rank(b) || a.guesses - b.guesses || a.name.localeCompare(b.name));
}
