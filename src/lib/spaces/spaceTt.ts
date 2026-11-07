import "server-only";

/**
 * Mario Kart's time trial challenges in a game space (spaces round three, picks 10 to 14, all as recommended):
 * the time trial of the day (today's track with today's combo, 150cc with mushrooms) and the weekly Combo Cup (that
 * week's combo on four tracks, the lowest total wins). Proof is the boards' own: every challenge time goes through
 * the time trials' addTime with its result screenshot (so the duplicate-screenshot, misread and laps checks run and
 * the time lands on the track's own board when it's the player's best there), the top places add a clip, which goes
 * into the same review queue as any clip, and an entry reads Verified from that board time. When the screenshot is
 * the ghost data screen, the parts it names must be the challenge's combo. A player keeps their best run per track
 * per day or week in `space_tt_entries`. Tokens (earn_space): one for posting on the day's challenge, and places
 * paid two days after a day or week closes, among verified times only (settleSpaceTt, from the daily cron).
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { gsAddDays, gsDay, gsWeekStart } from "@/lib/time/gsClock";
import { addTime, setVideo } from "@/lib/timeTrials/store";
import { trustedPlayers } from "@/lib/timeTrials/status";
import { formatTime, videoProof, type TtPlayer } from "@/lib/timeTrials/rules";
import { trackPath, ttTrack, type TtGame } from "@/lib/timeTrials/tracks";
import type { TtParts } from "@/lib/timeTrials/parts";
import type { ChatRoll } from "@/lib/twitch/chatRoll";
import type { GameSpace } from "@/lib/games/spaces";
import type { PersonAvatar } from "@/lib/home/people";
import { challengesReady, dayOf, paySpace, spaceLevers, weekOf, type ChallengeKind } from "./challenges";

/** Places that need a clip: the day's top three, the cup's top ten on each track. */
export const CLIP_PLACES: Record<ChallengeKind, number> = { day: 3, week: 10 };
/** Days after a day or week closes before its places are paid, so reviewers can check the clips. */
export const SETTLE_AFTER_DAYS = 2;

export interface TtChallengeInfo { kind: ChallengeKind; period: string; game: TtGame; tracks: string[]; combo: ChatRoll }

/** The space's time trial challenge for this day or week, or null (not a Mario Kart space, or not ready). */
export async function ttChallenge(s: GameSpace, kind: ChallengeKind): Promise<TtChallengeInfo | null> {
  if (!s.tt || !(await challengesReady())) return null;
  if (kind === "day") {
    const c = await dayOf(s);
    return c && c.type === "combo" && c.tt ? { kind, period: gsDay(), game: c.tt.game, tracks: [c.tt.track], combo: c.roll } : null;
  }
  const c = await weekOf(s);
  return c && c.type === "cup" ? { kind, period: gsWeekStart(), game: c.game, tracks: c.tracks, combo: c.roll } : null;
}

/** The parts a combo names, by label, lowercased, for comparing with what a screenshot read. */
const norm = (x: string) => x.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "");
function comboParts(combo: ChatRoll): { body: string | null; wheels: string | null; glider: string | null } {
  const by = (re: RegExp) => { const n = combo.slots.find((x) => re.test(x.label))?.name; return n ? norm(n) : null; };
  return { body: by(/vehicle|kart|body/i), wheels: by(/wheel|tire/i), glider: by(/glider/i) };
}

/** Whether a screenshot's parts contradict the combo (a part the screen names that isn't the combo's). */
export function comboMismatch(combo: ChatRoll, parts: TtParts | null | undefined): boolean {
  if (!parts) return false;
  const want = comboParts(combo);
  const same = (a: string | null, b: string | null | undefined) => !a || !b || a === norm(b);
  return !(same(want.body, parts.body) && same(want.wheels, parts.wheels) && same(want.glider, parts.glider));
}

export type AddChallengeError = "not_ready" | "closed" | "wrong_track" | "wrong_combo" | "faster_than_record" | "bad_track" | "bad_class" | "failed";
export type AddChallengeResult =
  | { ok: true; timeId: string; best: boolean; previousMs: number | null; place: number; total: number; needsVideo: boolean; trusted: boolean; tokens: number; boardBest: boolean }
  | { ok: false; error: AddChallengeError };

/** A challenge time: onto the track's board (with its proof checks), then the player's best for the challenge. */
export async function addChallengeTime(input: {
  s: GameSpace; kind: ChallengeKind; userId: string; player: TtPlayer; track: string; timeMs: number; proofUrl: string;
  laps: number[] | null; read: { timeMs: number | null; laps: number[] | null; parts: TtParts | null } | null;
}): Promise<AddChallengeResult> {
  const ch = await ttChallenge(input.s, input.kind);
  if (!ch) return { ok: false, error: "not_ready" };
  if (!ch.tracks.includes(input.track)) return { ok: false, error: "wrong_track" };
  if (comboMismatch(ch.combo, input.read?.parts)) return { ok: false, error: "wrong_combo" };

  const added = await addTime({
    player: input.player, userId: input.userId, identityId: null, game: ch.game, track: input.track, cc: 150, items: "shrooms", vehicle: "any",
    timeMs: input.timeMs, proof: "screenshot", proofUrl: input.proofUrl, readByAi: !!input.read?.timeMs && input.read.timeMs === input.timeMs,
    source: "site", laps: input.laps, readMs: input.read?.timeMs ?? null, readLaps: input.read?.laps ?? null, parts: input.read?.parts ?? null,
  });
  if (!added.ok) return { ok: false, error: (added.error as AddChallengeError) ?? "failed" };

  const db = createServiceClient();
  const key = { space: input.s.id, kind: input.kind, period: ch.period, track: input.track, user_id: input.userId };
  const { data: was } = await db.from("space_tt_entries").select("id, time_ms, board_time_id").match(key).maybeSingle();
  const prev = was as { id: string; time_ms: number; board_time_id: string | null } | null;
  const best = !prev || input.timeMs < prev.time_ms;
  let entryId = prev?.id ?? null;
  if (best) {
    const row = { ...key, time_ms: input.timeMs, laps: input.laps, proof_url: input.proofUrl, read_ms: input.read?.timeMs ?? null, board_time_id: added.timeId, updated_at: new Date().toISOString() };
    const { data, error } = await db.from("space_tt_entries").upsert(row, { onConflict: "space,kind,period,track,user_id" }).select("id").single();
    if (error) { console.error("[spaces] challenge entry failed:", error); return { ok: false, error: "failed" }; }
    entryId = (data as { id: string }).id;
  }
  const mine = best ? input.timeMs : prev!.time_ms;
  const [{ count: faster }, { count: total }] = await Promise.all([
    db.from("space_tt_entries").select("id", { count: "exact", head: true }).eq("space", input.s.id).eq("kind", input.kind).eq("period", ch.period).eq("track", input.track).lt("time_ms", mine),
    db.from("space_tt_entries").select("id", { count: "exact", head: true }).eq("space", input.s.id).eq("kind", input.kind).eq("period", ch.period).eq("track", input.track),
  ]);
  const place = (faster ?? 0) + 1;
  const lv = await spaceLevers();
  const tokens = input.kind === "day" ? await paySpace(input.userId, lv.ttEntry, `ttday-entry:${input.s.id}:${ch.period}:${input.userId}`, { space: input.s.id, kind: "tt_entry", day: ch.period }) : 0;
  return {
    ok: true, timeId: entryId!, best, previousMs: best ? prev?.time_ms ?? null : prev!.time_ms, place, total: total ?? 1,
    needsVideo: best && place <= CLIP_PLACES[input.kind] && !added.trusted, trusted: !!added.trusted, tokens, boardBest: added.best,
  };
}

/** The clip for a challenge entry goes on its board time, into the review queue like any clip. */
export async function addChallengeClip(userId: string, player: TtPlayer, entryId: string, url: string): Promise<{ ok: boolean; error?: string }> {
  const video = videoProof(url);
  if (!video) return { ok: false, error: "bad_video" };
  const { data } = await createServiceClient().from("space_tt_entries").select("user_id, board_time_id").eq("id", entryId).maybeSingle();
  const e = data as { user_id: string; board_time_id: string | null } | null;
  if (!e || e.user_id !== userId || !e.board_time_id) return { ok: false, error: "gone" };
  return (await setVideo(player, e.board_time_id, video)) ? { ok: true } : { ok: false, error: "gone" };
}

// ── Boards ──────────────────────────────────────────────────────────────────

export type EntryStatus = "verified" | "trusted" | "waiting" | "screenshot";
export interface TtBoardRow {
  userId: string; name: string; username: string | null; avatar: PersonAvatar; you: boolean;
  timeMs: number; time: string; status: EntryStatus; place: number;
}
export interface CupRow { userId: string; name: string; username: string | null; avatar: PersonAvatar; you: boolean; totalMs: number; total: string; tracks: number; verified: boolean; place: number }

type EntryRow = { user_id: string; track: string; time_ms: number; board_time_id: string | null };

async function entriesFor(spaceId: string, kind: ChallengeKind, period: string): Promise<EntryRow[]> {
  const { data } = await createServiceClient().from("space_tt_entries").select("user_id, track, time_ms, board_time_id").eq("space", spaceId).eq("kind", kind).eq("period", period).order("time_ms").limit(2000);
  return (data ?? []) as EntryRow[];
}

/** Each entry's proof status, from its board time's clip and the player's Trusted mark. */
async function statuses(rows: EntryRow[]): Promise<Map<string, EntryStatus>> {
  const ids = [...new Set(rows.map((r) => r.board_time_id).filter((x): x is string => !!x))];
  const out = new Map<string, EntryStatus>();
  if (!ids.length) return out;
  const db = createServiceClient();
  const { data } = await db.from("tt_times").select("id, video_status, status").in("id", ids);
  const byId = new Map(((data ?? []) as { id: string; video_status: string | null; status: string | null }[]).map((t) => [t.id, t]));
  const trusted = await trustedPlayers([...new Set(rows.map((r) => `u:${r.user_id}`))]).catch(() => new Set<string>());
  for (const r of rows) {
    const t = r.board_time_id ? byId.get(r.board_time_id) : undefined;
    if (!t || t.status !== "ok") continue;
    out.set(`${r.user_id}:${r.track}`, t.video_status === "checked" ? "verified" : trusted.has(`u:${r.user_id}`) ? "trusted" : t.video_status === "waiting" ? "waiting" : "screenshot");
  }
  return out;
}

async function people(ids: string[]): Promise<Map<string, { name: string; username: string | null; avatar: PersonAvatar }>> {
  if (!ids.length) return new Map();
  const { data } = await createServiceClient().from("users").select("id, display_name, username, is_public, avatar_source, avatar_seed, avatar_options, twitch_avatar, discord_avatar").in("id", ids);
  type U = { id: string; display_name: string | null; username: string | null; is_public: boolean | null; avatar_source: string | null; avatar_seed: string | null; avatar_options: Record<string, unknown> | null; twitch_avatar: string | null; discord_avatar: string | null };
  return new Map(((data ?? []) as U[]).map((u) => [u.id, {
    name: u.is_public === false || !u.username ? "A player" : u.display_name || u.username,
    username: u.is_public === false ? null : u.username,
    avatar: { id: u.id, avatar_source: u.avatar_source, avatar_seed: u.avatar_seed, avatar_options: u.avatar_options, twitch_avatar: u.twitch_avatar, discord_avatar: u.discord_avatar },
  }]));
}

/** The day's board: everyone's best on today's track, fastest first, with each time's proof status. Removed board
 *  times (after a report) drop off. */
export async function dayBoard(s: GameSpace, viewerId: string | null, period = gsDay()): Promise<TtBoardRow[]> {
  const rows = (await entriesFor(s.id, "day", period)).filter((r) => r.board_time_id);
  const st = await statuses(rows);
  const live = rows.filter((r) => st.has(`${r.user_id}:${r.track}`));
  const who = await people(live.map((r) => r.user_id));
  let place = 0, lastMs = -1;
  return live.map((r, i) => {
    if (r.time_ms !== lastMs) { place = i + 1; lastMs = r.time_ms; }
    const p = who.get(r.user_id) ?? { name: "A player", username: null, avatar: { id: r.user_id } as PersonAvatar };
    return { userId: r.user_id, ...p, you: r.user_id === viewerId, timeMs: r.time_ms, time: formatTime(r.time_ms), status: st.get(`${r.user_id}:${r.track}`)!, place };
  });
}

/** The cup's standings: players with a time on all of its tracks, by total, lowest first; `verified` when every one
 *  of their four times is verified (or they're Trusted). Players still missing a track follow, by tracks done. */
export async function cupBoard(s: GameSpace, viewerId: string | null, tracks: string[], period = gsWeekStart()): Promise<CupRow[]> {
  const rows = (await entriesFor(s.id, "week", period)).filter((r) => r.board_time_id && tracks.includes(r.track));
  const st = await statuses(rows);
  const byUser = new Map<string, EntryRow[]>();
  for (const r of rows) if (st.has(`${r.user_id}:${r.track}`)) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r]);
  const who = await people([...byUser.keys()]);
  const list = [...byUser.entries()].map(([userId, rs]) => {
    const totalMs = rs.reduce((a, r) => a + r.time_ms, 0);
    const verified = rs.length === tracks.length && rs.every((r) => ["verified", "trusted"].includes(st.get(`${userId}:${r.track}`)!));
    const p = who.get(userId) ?? { name: "A player", username: null, avatar: { id: userId } as PersonAvatar };
    return { userId, ...p, you: userId === viewerId, totalMs, total: formatTime(totalMs), tracks: rs.length, verified, place: 0 };
  }).sort((a, b) => (b.tracks - a.tracks) || (a.totalMs - b.totalMs));
  let place = 0;
  for (const r of list) r.place = r.tracks === tracks.length ? ++place : 0;
  return list;
}

/** A track's own board link for the challenge's class and items. */
export function challengeTrackHref(game: TtGame, track: string): string | null {
  const t = ttTrack(game, track);
  return t ? trackPath(t, 150, { items: "shrooms" }) : null;
}

// ── Paying places ───────────────────────────────────────────────────────────

/**
 * Pays the places of closed days and weeks, SETTLE_AFTER_DAYS after they close, among verified (or Trusted) times
 * only: the day's top three, the cup's top three totals. Each place pays once (its own key), so running it again
 * changes nothing. Looks back two weeks.
 */
export async function settleSpaceTt(spaces: GameSpace[]): Promise<{ paid: number }> {
  if (!(await challengesReady())) return { paid: 0 };
  const lv = await spaceLevers();
  let paid = 0;
  const today = gsDay();
  for (const s of spaces.filter((x) => x.tt)) {
    for (let back = SETTLE_AFTER_DAYS + 1; back <= 14; back++) {
      const day = gsAddDays(today, -back);
      const board = (await dayBoard(s, null, day)).filter((r) => r.status === "verified" || r.status === "trusted");
      for (let i = 0; i < Math.min(3, board.length); i++) {
        paid += await paySpace(board[i].userId, lv.ttDay[i], `ttday-place:${s.id}:${day}:${i + 1}`, { space: s.id, kind: "tt_day_place", day, place: i + 1 });
      }
    }
    for (let w = 1; w <= 2; w++) {
      const week = gsAddDays(gsWeekStart(), -7 * w);
      if (gsAddDays(week, 7 + SETTLE_AFTER_DAYS) > today) continue;
      const { data } = await createServiceClient().from("space_challenges").select("challenge").eq("space", s.id).eq("kind", "week").eq("period", week).maybeSingle();
      const c = (data as { challenge: { type: string; tracks?: string[] } } | null)?.challenge;
      if (!c || c.type !== "cup" || !c.tracks) continue;
      const board = (await cupBoard(s, null, c.tracks, week)).filter((r) => r.place > 0 && r.verified);
      for (let i = 0; i < Math.min(3, board.length); i++) {
        paid += await paySpace(board[i].userId, lv.cup[i], `cup-place:${s.id}:${week}:${i + 1}`, { space: s.id, kind: "cup_place", week, place: i + 1 });
      }
    }
  }
  return { paid };
}
