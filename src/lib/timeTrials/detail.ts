import "server-only";

/**
 * Everything about one time, for its window on the board (round 3 pick 1A): the proof, the laps (the player's best
 * lap on the track marked), the player, where it stands (Verified, Trusted, Under review, ...), its vouches and its
 * history. Also vouching (anyone signed in; ten vouches = Community verified, a checked clip still gives Verified) and national records
 * (pick 6A: each country's best on a board).
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { describePlayers } from "@/lib/daily/boards";
import { boardFor, playerBests, timeById, topTenIds, ttReady, type TtTimeRow } from "./store";
import { categoryText, vehicleFor, type TtItems, type TtVehicle } from "./categories";
import { countriesFor, round3Ready, round4Ready, trustedPlayers, underReview, vouchCounts } from "./status";
import type { TtParts } from "./parts";
import { isProofLink } from "./sheets";
import { COMMUNITY_VOUCHES, lapsAddUp, timeStatus, type ProofKind, type TimeStatus } from "./rules";
import { playerPagePath } from "./playerPath";
import { trackPath, ttTrack, TT_GAMES, type TtClass, type TtGame } from "./tracks";
import { askView, asksReady, type AskView } from "./asks";
import { formatTime } from "./rules";

export type { TimeStatus };

export interface TtTimeDetail {
  id: string;
  game: TtGame;
  trackName: string;
  category: string;
  cc: TtClass;
  items: TtItems;
  vehicle: TtVehicle;
  timeMs: number;
  place: number;
  total: number;
  top: boolean;
  proof: ProofKind;
  proofUrl: string | null;
  videoUrl: string | null;
  laps: number[] | null;
  lapsAddUp: boolean;
  /** Which of these laps is the player's best lap on this track (any of their times), or null. */
  bestLap: number | null;
  status: TimeStatus;
  verifiedIn: string[];
  vouches: number;
  player: { key: string; name: string; avatar: string | null; page: string; records: number; country: string | null; trusted: boolean };
  history: { at: string | null; text: string }[];
  you: boolean;
  youVouched: boolean;
  /** The viewer may vouch: signed in and not their own time (anyone signed in, picks 2026-11-04). */
  canVouch: boolean;
  boardPath: string;
  /** A legacy time (round 4: brought over from the community's records), no chip since "Legacy" was retired (2026-11-07). */
  sheet: boolean;
  /** Its proof when the record carried a clip or a post; never a spreadsheet. */
  legacyProof: string | null;
  /** The vehicle parts the screenshot named (picks 2026-11-04). */
  parts: TtParts | null;
  /** Lap splits against the record on this board, or the fastest time there with laps (round 4, pick 7A). */
  splits: { name: string; page: string; timeMs: number; laps: number[]; record: boolean } | null;
  /** The open ask on it, for its player and reviewers (picks 2026-11-08). */
  ask: AskView | null;
  /** Its player can fix the time, laps or category: theirs, not verified, added on the site or in Discord. */
  canFix: boolean;
  /** The speeds its game has (the fix window's choices). */
  classes: TtClass[];
}

type Extra = { laps: number[] | null; video_checked_at: string | null; sheet: string | null; sheet_link: string | null; body: string | null; wheels: string | null; glider: string | null; changes: Change[] };

async function extraFor(id: string): Promise<Extra> {
  const cols = (await round4Ready()) ? "laps, video_checked_at, sheet, sheet_link, body, wheels, glider" : (await round3Ready()) ? "laps, video_checked_at" : "video_checked_at";
  const first = await createServiceClient().from("tt_times").select(cols).eq("id", id).maybeSingle();
  let data: unknown = first.data;
  // The parts columns came later in time-trials-m5.sql than the rest of it: read without them where they're missing.
  if (first.error && cols.includes("body")) data = (await createServiceClient().from("tt_times").select("laps, video_checked_at, sheet, sheet_link").eq("id", id).maybeSingle()).data;
  const r = (data ?? {}) as Partial<Extra>;
  // The player's own fixes (time-trials-m7.sql), read on their own so the rest works before it runs.
  const changes = (await asksReady()) ? ((await createServiceClient().from("tt_times").select("changes").eq("id", id).maybeSingle()).data as { changes?: Change[] } | null)?.changes ?? [] : [];
  return { laps: r.laps ?? null, video_checked_at: r.video_checked_at ?? null, sheet: r.sheet ?? null, sheet_link: r.sheet_link ?? null, body: r.body ?? null, wheels: r.wheels ?? null, glider: r.glider ?? null, changes: Array.isArray(changes) ? changes : [] };
}

/**
 * Whose laps to put beside this time's: the board's record when it has laps, else the fastest time on the board that
 * has the same number of laps recorded. Null when this time is that time, or nobody's laps are recorded.
 */
async function splitsFor(t: TtTimeRow, board: TtVehicle, laps: number[] | null): Promise<TtTimeDetail["splits"]> {
  return lapsAgainst({ timeId: t.id, game: t.game, track: t.track, cc: t.cc, items: t.items, board, laps });
}

type BoardQuery = { game: TtGame; track: string; cc: TtClass; items: TtItems; board: TtVehicle };

/** A board's times (the open board counts every vehicle; Inside drift counts the Yoshi Bike too). */
function boardTimes(q: BoardQuery) {
  const db = createServiceClient();
  const vehicles = q.board === "any" ? null : q.board === "inside_drift" ? ["inside_drift", "yoshi_bike"] : [q.board];
  const base = db.from("tt_times").select("id, player, time_ms, laps").eq("game", q.game).eq("track", q.track).eq("cc", q.cc).eq("items", q.items).eq("status", "ok");
  return vehicles ? base.in("vehicle", vehicles) : base;
}

/**
 * The record's laps on a board, when it has them (Discord's /tt track, doc asks pick 4, 2026-11-10).
 */
export async function recordLaps(q: BoardQuery): Promise<{ name: string; timeMs: number; laps: number[] } | null> {
  if (!(await round3Ready())) return null;
  const { data } = await boardTimes(q).order("time_ms").order("created_at").limit(1).maybeSingle();
  const r = data as { player: string; time_ms: number; laps: number[] | null } | null;
  if (!r?.laps?.length) return null;
  const who = (await describePlayers([r.player])).get(r.player);
  return { name: who?.name ?? "A player", timeMs: r.time_ms, laps: r.laps };
}

/**
 * Laps to put beside a time's (the site's time window, and a new best in Discord): the board's record when it has
 * laps, else the fastest time on the board with the same number of laps. Null for that time itself, or no laps.
 */
export async function lapsAgainst(q: BoardQuery & { timeId: string | null; laps: number[] | null }): Promise<TtTimeDetail["splits"]> {
  const laps = q.laps;
  if (!laps?.length || !(await round3Ready())) return null;
  const t = { id: q.timeId };
  const base = () => boardTimes(q);
  const [{ data: rec }, { data: lapped }] = await Promise.all([
    base().order("time_ms").order("created_at").limit(1).maybeSingle(),
    base().not("laps", "is", null).order("time_ms").order("created_at").limit(20),
  ]);
  type R = { id: string; player: string; time_ms: number; laps: number[] | null };
  const record = rec as R | null;
  const pick = ((lapped ?? []) as R[]).find((r) => r.laps?.length === laps.length);
  if (!pick || pick.id === t.id) return null;
  const who = (await describePlayers([pick.player])).get(pick.player);
  return { name: who?.name ?? "A player", page: playerPagePath(pick.player, who?.profile ?? null), timeMs: pick.time_ms, laps: pick.laps!, record: record?.id === pick.id };
}

/** The player's best single lap on this track, speed and items (from every time of theirs with laps). */
async function bestLapOn(t: TtTimeRow): Promise<number | null> {
  if (!(await round3Ready())) return null;
  const { data } = await createServiceClient().from("tt_times").select("laps").eq("player", t.player).eq("game", t.game).eq("track", t.track).eq("cc", t.cc).eq("items", t.items).eq("status", "ok").not("laps", "is", null).limit(200);
  const all = ((data ?? []) as { laps: number[] | null }[]).flatMap((r) => r.laps ?? []);
  return all.length ? Math.min(...all) : null;
}

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" }) : null);

type Change = { at: string; by?: "owner" | "reviewer"; from: { timeMs: number }; to: { timeMs: number } };
function changeText(c: Change): string {
  const what = c.from.timeMs !== c.to.timeMs ? `from ${formatTime(c.from.timeMs)} to ${formatTime(c.to.timeMs)}` : null;
  if (c.by === "reviewer") return what ? `Fixed by a reviewer ${what}` : "Category or laps fixed by a reviewer";
  return what ? `Changed ${what}` : "Category or laps changed";
}

export async function timeDetail(id: string, viewer: string | null, viewerReviews = false): Promise<TtTimeDetail | null> {
  if (!(await ttReady())) return null;
  const t = await timeById(id);
  if (!t || t.status !== "ok") return null;
  const track = ttTrack(t.game, t.track);
  if (!track) return null;
  const db = createServiceClient();
  // The board it's on: its vehicle board when it has one (an older Yoshi Bike time sits on Inside drift).
  const board = vehicleFor(t.game, t.vehicle);
  const [names, extra, bestLap, review, trusted, vouches, countries, verified, bests, top, mine, openReports] = await Promise.all([
    describePlayers([t.player]),
    extraFor(t.id),
    bestLapOn(t),
    underReview([t.id]),
    trustedPlayers([t.player]),
    vouchCounts([t.id]),
    countriesFor([t.player]),
    db.from("tt_verifications").select("guild_name").eq("time_id", t.id),
    playerBests(t.player as `u:${string}`),
    topTenIds(t.game, t.track, t.cc, t.items, board),
    viewer && (await round3Ready()) ? db.from("tt_vouches").select("time_id").eq("time_id", t.id).eq("voter", viewer).maybeSingle() : Promise.resolve({ data: null }),
    db.from("tt_reports").select("created_at").eq("time_id", t.id).in("state", ["open", "waiting_owner", "waiting_review"]).order("created_at").limit(1),
  ]);
  const who = names.get(t.player);
  const place = bests.find((b) => b.game === t.game && b.track === t.track && b.cc === t.cc && b.items === t.items && b.vehicle === board && b.timeId === t.id);
  const isTop = top.has(t.id);
  const isTrusted = trusted.has(t.player);
  const you = !!viewer && viewer === t.player;
  const n = vouches.get(t.id) ?? 0;
  const status: TimeStatus = timeStatus({ review: review.has(t.id), video: t.video, videoUrl: t.videoUrl, top: isTop, trusted: isTrusted, you, vouches: n, sheet: t.source === "sheet" });
  const history: { at: string | null; text: string }[] = [
    { at: t.createdAt, text: t.source === "sheet" ? "Brought over from the community's records" : t.source === "import" ? "Added from an import" : t.proof === "screenshot" ? (t.source === "discord" ? "Added in Discord with a screenshot" : "Added with a screenshot") : "Added" },
  ];
  if (t.videoUrl && t.video === "checked") history.push({ at: extra.video_checked_at, text: "Clip checked by an updater" });
  else if (t.video === "checked") history.push({ at: extra.video_checked_at, text: t.source === "sheet" ? "Proof checked by an updater" : "Checked by an updater" });
  else if (t.videoUrl && t.video === "waiting") history.push({ at: null, text: "Clip added, waiting for an updater" });
  // An ask's own line (below) says it; an older send-back without a thread reads the same way.
  else if (t.video === "rejected" && you && !(await asksReady())) history.push({ at: extra.video_checked_at, text: t.source === "sheet" && !t.videoUrl ? "A reviewer asked for other proof" : "A reviewer asked for a new clip" });
  const firstReport = ((openReports.data ?? []) as { created_at: string }[])[0];
  if (firstReport && review.has(t.id)) history.push({ at: firstReport.created_at, text: "Under review" });
  if (n) history.push({ at: null, text: `Vouched for by ${n} ${n === 1 ? "player" : "players"}${n >= COMMUNITY_VOUCHES ? ": Community verified" : ""}` });
  // An ask and the player's fixes, for the player and reviewers only (an ask never shows on the board).
  const ask = you || viewerReviews ? await askView(t) : null;
  if (ask && ask.state !== "fixed") history.push({ at: ask.askedAt, text: "A reviewer asked for an update" });
  else if (t.video === "rejected" && you && (await asksReady())) history.push({ at: extra.video_checked_at, text: "A reviewer asked for a new clip" });
  if (you || viewerReviews) for (const c of extra.changes) history.push({ at: c.at, text: changeText(c) });
  const youVouched = !!(mine as { data: unknown }).data;
  const bi = extra.laps && bestLap != null ? extra.laps.indexOf(bestLap) : -1;
  const path = trackPath(track, t.cc, { items: t.items, vehicle: t.vehicle });
  return {
    id: t.id, game: t.game, trackName: track.name, category: categoryText(t.game, t.cc, t.items, t.vehicle, TT_GAMES[t.game].classes.length > 1),
    cc: t.cc, items: t.items, vehicle: t.vehicle, timeMs: t.timeMs, place: place?.place ?? 0, total: place?.total ?? 0, top: isTop,
    proof: t.proof, proofUrl: t.proof !== "none" ? t.proofUrl : null, videoUrl: t.video === "checked" ? t.videoUrl : null,
    laps: extra.laps, lapsAddUp: lapsAddUp(extra.laps, t.timeMs),
    bestLap: bi >= 0 ? bi : null,
    status, verifiedIn: ((verified.data ?? []) as { guild_name: string | null }[]).map((v) => v.guild_name || "a Discord server"), vouches: n,
    player: { key: t.player, name: who?.name ?? "A player", avatar: who?.avatar ?? null, page: playerPagePath(t.player, who?.profile ?? null), records: bests.filter((b) => b.place === 1).length, country: countries.get(t.player) ?? null, trusted: isTrusted },
    history: history.map((h) => ({ at: day(h.at), text: h.text })),
    you, youVouched, canVouch: !!viewer && !you && !youVouched && (await round3Ready()),
    boardPath: `${path}${path.includes("?") ? "&" : "?"}time=${t.id}`,
    sheet: t.source === "sheet",
    legacyProof: t.source === "sheet" && extra.sheet_link && isProofLink(extra.sheet_link) ? extra.sheet_link : null,
    parts: extra.body ? { body: extra.body, wheels: extra.wheels, glider: extra.glider } : null,
    splits: await splitsFor(t, board, extra.laps),
    ask,
    canFix: you && t.video !== "checked" && (t.source === "site" || t.source === "discord") && (await asksReady()),
    classes: TT_GAMES[t.game].classes,
  };
}

/** A vouch (or taking one back). Anyone signed in can vouch, never for their own time (picks 2026-11-04: open while
 *  the site is young; trusted community members come later). */
export async function setVouch(timeId: string, voter: string, on: boolean): Promise<"ok" | "not_eligible" | "own" | "gone" | "not_ready"> {
  if (!(await round3Ready())) return "not_ready";
  const t = await timeById(timeId);
  if (!t || t.status !== "ok") return "gone";
  if (t.player === voter) return "own";
  const db = createServiceClient();
  if (!on) { await db.from("tt_vouches").delete().eq("time_id", timeId).eq("voter", voter); return "ok"; }
  await db.from("tt_vouches").upsert({ time_id: timeId, voter }, { onConflict: "time_id,voter", ignoreDuplicates: true });
  return "ok";
}

export interface NationalRecord { country: string; timeMs: number; name: string; page: string; timeId: string }

/** Each country's best on a board (from its top 500), fastest first. */
export async function nationalRecords(game: TtGame, track: string, cc: TtClass, items: TtItems, vehicle: TtVehicle): Promise<NationalRecord[]> {
  if (!(await round3Ready())) return [];
  const b = await boardFor({ game, track, cc, items, vehicle, scope: "everyone", viewer: null, limit: 500 });
  const seen = new Set<string>();
  const out: NationalRecord[] = [];
  for (const r of b.rows) {
    if (!r.country || seen.has(r.country)) continue;
    seen.add(r.country);
    out.push({ country: r.country, timeMs: r.timeMs, name: r.name, page: r.page, timeId: r.timeId });
  }
  return out;
}
