import "server-only";

/**
 * "Count it in <event>" from Discord (/tt add, events pick 10A), for every kind of time trial tournament: a time trial
 * event (its window and run-offs, in store.ts), and Swiss or single or double elimination brackets decided by time
 * trial (the player's open match). The board time already has its screenshot, so the event points at it instead of
 * adding a second one.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { gameBySlug, type TtGame } from "@/lib/timeTrials/tracks";
import { SWISS_ERRORS, loadSwiss, swissTtAdd, swissTtMatchFor } from "../swissStore";
import { bracketTracks, isTtBracket, openMatchFor } from "./bracketTt";
import { bracketMatchHeld, bracketMessage, bracketTtAdd, loadBracketTt } from "./bracketStore";
import { ttSettingsOf } from "./event";
import { TT_ERRORS, countBoardTime, eventsForBoardTime, ttEventsReady, type TtEventChoice } from "./store";
import { isTtSwiss } from "./swissTt";

const SEATED = ["confirmed", "checked_in"];
const svc = () => createServiceClient();

interface BoardTime { game: TtGame; track: string; cc: number; items: string; vehicle: string }

/** Swiss and bracket events where the player's open match races this track on this board. */
async function matchEventsFor(userId: string, t: BoardTime): Promise<TtEventChoice[]> {
  if (!(await ttEventsReady())) return [];
  const db = svc();
  const { data: mine } = await db.from("tournament_participants").select("id, tournament_id").eq("user_id", userId).in("status", SEATED);
  const rows = (mine ?? []) as { id: string; tournament_id: string }[];
  if (!rows.length) return [];
  const { data } = await db.from("tournaments").select("id, title, format, game_slug, settings")
    .in("id", [...new Set(rows.map((r) => r.tournament_id))]).in("format", ["single_elim", "double_elim", "swiss"]).eq("status", "in_progress");
  const out: TtEventChoice[] = [];
  for (const r of (data ?? []) as { id: string; title: string; format: string; game_slug: string; settings: Record<string, unknown> | null }[]) {
    const bracket = isTtBracket(r);
    if (!bracket && !(r.format === "swiss" && isTtSwiss(r.settings))) continue;
    if (gameBySlug(r.game_slug)?.id !== t.game) continue;
    const s = ttSettingsOf(r.settings?.tt, t.game);
    if (s.cc !== t.cc || s.items !== t.items || (s.vehicle !== "any" && s.vehicle !== t.vehicle)) continue;
    const pid = rows.find((x) => x.tournament_id === r.id)!.id;
    if (bracket) {
      const ctx = await loadBracketTt(r.id);
      if (!ctx || ctx === "missing" || !ctx.bracket) continue;
      const m = openMatchFor(ctx.bracket, pid);
      if (m && !bracketMatchHeld(ctx, ctx.bracket, m) && bracketTracks(ctx.settings.tracks, ctx.bestOf, ctx.bracket, m).includes(t.track)) out.push({ id: r.id, title: r.title });
    } else {
      const ctx = await loadSwiss(r.id);
      if (!ctx || ctx === "missing") continue;
      const mt = swissTtMatchFor(ctx, pid);
      if (mt && !mt.settled && !mt.held && mt.tracks.includes(t.track)) out.push({ id: r.id, title: r.title });
    }
  }
  return out;
}

/** Every time trial tournament the player could count this board time in now. */
export async function eventsForBoardTimeAll(userId: string, t: BoardTime): Promise<TtEventChoice[]> {
  const [events, matches] = await Promise.all([eventsForBoardTime(userId, t), matchEventsFor(userId, t).catch(() => [])]);
  return [...events, ...matches];
}

export type CountIn =
  | { ok: true; kind: "event"; title: string; game: TtGame; track: string; place: number; total: number; needsClip: boolean; runoff: boolean }
  | { ok: true; kind: "match"; title: string; game: TtGame; track: string; won: number; lost: number; settled: boolean; held: boolean; needsClip: boolean }
  | { ok: false; message: string };

/** Counts one of the player's board times (with its screenshot) in a time trial tournament of any kind. */
export async function countInEvent(id: string, userId: string, boardTimeId: string): Promise<CountIn> {
  const db = svc();
  const { data: tr } = await db.from("tournaments").select("title, format, game_slug, settings").eq("id", id).maybeSingle();
  const t = tr as { title: string; format: string | null; game_slug: string | null; settings: Record<string, unknown> | null } | null;
  if (!t) return { ok: false, message: TT_ERRORS.not_found };
  if (t.format === "time_trial") {
    const r = await countBoardTime(id, userId, boardTimeId);
    return r.ok ? { kind: "event", ...r } : { ok: false, message: TT_ERRORS[r.error] };
  }
  const bracket = isTtBracket(t);
  if (!bracket && !(t.format === "swiss" && isTtSwiss(t.settings))) return { ok: false, message: TT_ERRORS.not_tt };
  const game = (gameBySlug(t.game_slug ?? "")?.id ?? "mk8dx") as TtGame;
  const { data } = await db.from("tt_times").select("id, player, game, track, cc, items, vehicle, time_ms, proof_kind, proof_url, laps, read_ms, status").eq("id", boardTimeId).maybeSingle();
  const b = data as { id: string; player: string; game: string; track: string; cc: number; items: string; vehicle: string; time_ms: number; proof_kind: string; proof_url: string | null; laps: number[] | null; read_ms: number | null; status: string } | null;
  if (!b || b.player !== `u:${userId}` || b.status !== "ok") return { ok: false, message: TT_ERRORS.gone };
  if (b.proof_kind !== "screenshot" || !b.proof_url) return { ok: false, message: TT_ERRORS.screenshot_required };
  const s = ttSettingsOf(t.settings?.tt, game);
  if (b.game !== game || b.cc !== s.cc || b.items !== s.items || (s.vehicle !== "any" && b.vehicle !== s.vehicle)) return { ok: false, message: TT_ERRORS.bad_track };
  const input = { track: b.track, ms: b.time_ms, screenshot: b.proof_url, laps: b.laps, read: b.read_ms != null ? { timeMs: b.read_ms, laps: null, parts: null } : null, boardTimeId: b.id };
  if (bracket) {
    const r = await bracketTtAdd(id, userId, input);
    return r.ok ? { ok: true, kind: "match", title: t.title, game, track: b.track, won: r.won, lost: r.lost, settled: r.settled, held: r.held, needsClip: r.needsClip } : { ok: false, message: bracketMessage(r.error) };
  }
  const r = await swissTtAdd(id, userId, input);
  if (!r.ok) return { ok: false, message: r.error === "bad_track" ? "That track isn't in your match." : r.error === "closed" ? "Your match is already settled." : r.error === "held" ? TT_ERRORS.held : SWISS_ERRORS[r.error] };
  return { ok: true, kind: "match", title: t.title, game, track: b.track, won: r.won, lost: r.lost, settled: r.settled, held: r.held, needsClip: r.needsClip };
}
