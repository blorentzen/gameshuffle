import "server-only";

/**
 * Everything about one time, for its window on the board (round 3 pick 1A): the proof, the laps (the player's best
 * lap on the track marked), the player, where it stands (Verified, Trusted, Under review, ...), its vouches and its
 * history. Also vouching (pick 9A: players with a checked time; an updater still decides) and national records
 * (pick 6A: each country's best on a board).
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { describePlayers } from "@/lib/daily/boards";
import { boardFor, playerBests, timeById, topTenIds, ttReady, type TtTimeRow } from "./store";
import { categoryText, type TtItems, type TtVehicle } from "./categories";
import { countriesFor, round3Ready, trustedPlayers, underReview, vouchCounts } from "./status";
import { lapsAddUp, type ProofKind } from "./rules";
import { playerPagePath } from "./playerPath";
import { trackPath, ttTrack, TT_GAMES, type TtClass, type TtGame } from "./tracks";

export type TimeStatus = "verified" | "trusted" | "review" | "waiting" | "rejected" | "unverified" | "none";

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
  /** The viewer may vouch: signed in, not their own time, with a checked time of their own. */
  canVouch: boolean;
  boardPath: string;
}

type Extra = { laps: number[] | null; video_checked_at: string | null };

async function extraFor(id: string): Promise<Extra> {
  const cols = (await round3Ready()) ? "laps, video_checked_at" : "video_checked_at";
  const { data } = await createServiceClient().from("tt_times").select(cols).eq("id", id).maybeSingle();
  const r = (data ?? {}) as Partial<Extra>;
  return { laps: r.laps ?? null, video_checked_at: r.video_checked_at ?? null };
}

/** The player's best single lap on this track, speed and items (from every time of theirs with laps). */
async function bestLapOn(t: TtTimeRow): Promise<number | null> {
  if (!(await round3Ready())) return null;
  const { data } = await createServiceClient().from("tt_times").select("laps").eq("player", t.player).eq("game", t.game).eq("track", t.track).eq("cc", t.cc).eq("items", t.items).eq("status", "ok").not("laps", "is", null).limit(200);
  const all = ((data ?? []) as { laps: number[] | null }[]).flatMap((r) => r.laps ?? []);
  return all.length ? Math.min(...all) : null;
}

async function hasCheckedTime(player: string): Promise<boolean> {
  const { data } = await createServiceClient().from("tt_times").select("id").eq("player", player).eq("status", "ok").eq("video_status", "checked").limit(1);
  return !!data?.length;
}

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" }) : null);

export async function timeDetail(id: string, viewer: string | null): Promise<TtTimeDetail | null> {
  if (!(await ttReady())) return null;
  const t = await timeById(id);
  if (!t || t.status !== "ok") return null;
  const track = ttTrack(t.game, t.track);
  if (!track) return null;
  const db = createServiceClient();
  // The board it's on: its vehicle board when it has one (a Yoshi Bike time counts on Inside drift too, but this is its own).
  const board = t.vehicle;
  const [names, extra, bestLap, review, trusted, vouches, countries, verified, bests, top, mine, viewerChecked, openReports] = await Promise.all([
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
    viewer && viewer !== t.player ? hasCheckedTime(viewer) : Promise.resolve(false),
    db.from("tt_reports").select("created_at").eq("time_id", t.id).in("state", ["open", "waiting_owner", "waiting_review"]).order("created_at").limit(1),
  ]);
  const who = names.get(t.player);
  const place = bests.find((b) => b.game === t.game && b.track === t.track && b.cc === t.cc && b.items === t.items && b.vehicle === board && b.timeId === t.id);
  const isTop = top.has(t.id);
  const isTrusted = trusted.has(t.player);
  const you = !!viewer && viewer === t.player;
  const status: TimeStatus = review.has(t.id) ? "review"
    : t.video === "checked" ? "verified"
    : t.video === "waiting" && t.videoUrl ? "waiting"
    : isTop && isTrusted ? "trusted"
    : t.video === "rejected" && you ? "rejected"
    : isTop ? "unverified" : "none";
  const n = vouches.get(t.id) ?? 0;
  const history: { at: string | null; text: string }[] = [
    { at: t.createdAt, text: t.source === "import" ? "Added from an import" : t.proof === "screenshot" ? (t.source === "discord" ? "Added in Discord with a screenshot" : "Added with a screenshot") : "Added" },
  ];
  if (t.videoUrl && t.video === "checked") history.push({ at: extra.video_checked_at, text: "Clip checked by an updater" });
  else if (t.videoUrl && t.video === "waiting") history.push({ at: null, text: "Clip added, waiting for an updater" });
  else if (t.video === "rejected" && you) history.push({ at: extra.video_checked_at, text: "Clip turned down" });
  const firstReport = ((openReports.data ?? []) as { created_at: string }[])[0];
  if (firstReport && review.has(t.id)) history.push({ at: firstReport.created_at, text: "Under review" });
  if (n) history.push({ at: null, text: `Vouched for by ${n} ${n === 1 ? "player" : "players"} with checked times` });
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
    you, youVouched, canVouch: !you && !youVouched && !!viewerChecked && (await round3Ready()),
    boardPath: `${path}${path.includes("?") ? "&" : "?"}time=${t.id}`,
  };
}

/** A vouch (or taking one back). Only players with a checked time can vouch, never for their own. */
export async function setVouch(timeId: string, voter: string, on: boolean): Promise<"ok" | "not_eligible" | "own" | "gone" | "not_ready"> {
  if (!(await round3Ready())) return "not_ready";
  const t = await timeById(timeId);
  if (!t || t.status !== "ok") return "gone";
  if (t.player === voter) return "own";
  const db = createServiceClient();
  if (!on) { await db.from("tt_vouches").delete().eq("time_id", timeId).eq("voter", voter); return "ok"; }
  if (!(await hasCheckedTime(voter))) return "not_eligible";
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
