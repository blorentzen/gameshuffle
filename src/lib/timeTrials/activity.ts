import "server-only";

/**
 * The War room's Time trials tab (src/lib/timeTrials/activityView.ts has the shapes): every track's server record with
 * the viewer's gap, and Add a time from a screenshot dropped in the Activity. The viewer is the Activity session's
 * Discord player (their account when Discord is linked, else their chat identity), like /tt; times are saved, the
 * server's board learns the player, a fallen server record is posted in the panel channel and the panels refresh,
 * the same as a time added with /tt.
 */

import sharp from "sharp";
import { SITE_URL } from "@/lib/seo";
import { describePlayers } from "@/lib/daily/boards";
import type { ActivitySession } from "@/lib/activity/session";
import { roomImg } from "@/lib/wars/room";
import { postServerRecord, guildName } from "@/lib/discord/commands/timeTrials";
import { refreshPanels } from "@/lib/discord/ttPanel";
import { keyFromPublicUrl } from "@/lib/storage/r2";
import { discordActor, type TtActor } from "./players";
import { addTime, noteGuildPlayer, playerBests, trackSummary, ttReady } from "./store";
import { serverRecord, serverSummary } from "./server";
import { readScreenshot, readsLeft, storeScreenshot } from "./read";
import { readFrom, signRead } from "./proof";
import { parseTime, MIN_MS, MAX_MS } from "./rules";
import { trackCode } from "./codes";
import { gamePath, isClassFor, serverPath, ttTrack, ttTracks, TT_GAMES, type TtClass, type TtGame } from "./tracks";
import { vehicleFor, vehicleOptions, type TtItems, type TtVehicle } from "./categories";
import type { TtRoomRead, TtRoomRow, TtRoomSaved, TtRoomScope, TtRoomView } from "./activityView";

const actorOf = (s: ActivitySession): Promise<TtActor> => discordActor({ id: s.did, username: s.name });

export async function ttRoomView(s: ActivitySession, game: TtGame, cc: TtClass, items: TtItems, wantScope: TtRoomScope = "server", wantVehicle: TtVehicle = "any"): Promise<TtRoomView> {
  const actor = await actorOf(s);
  const vehicle = vehicleFor(game, wantVehicle);
  // Everyone outside a server (a DM has no server board).
  const scope: TtRoomScope = wantScope === "server" && s.gid ? "server" : "everyone";
  const [summary, bests, server, left] = await Promise.all([
    scope === "server" && s.gid ? serverSummary(s.gid, game, items, vehicle) : trackSummary(game, items, vehicle),
    playerBests(actor.player),
    s.gid ? guildName(s.gid) : Promise.resolve(null),
    readsLeft(actor.userId),
  ]);
  const records = new Map(summary.filter((r) => r.cc === cc).map((r) => [r.track, r]));
  const names = await describePlayers([...new Set([...records.values()].map((r) => r.recordPlayer))]);
  const mine = new Map(bests.filter((b) => b.game === game && b.cc === cc && b.items === items && b.vehicle === vehicle).map((b) => [b.track, b.timeMs]));
  const rows: TtRoomRow[] = ttTracks(game).map((t) => {
    const r = records.get(t.id);
    return {
      id: t.id, code: trackCode(t), name: t.name, cup: t.cup, image: roomImg(t.image),
      record: r ? { ms: r.recordMs, name: r.recordPlayer === actor.player ? "You" : names.get(r.recordPlayer)?.name ?? "A player", mine: r.recordPlayer === actor.player, checked: r.recordChecked } : null,
      mine: mine.get(t.id) ?? null,
    };
  });
  return {
    game, cc, items, scope, canServer: !!s.gid, vehicle,
    vehicles: vehicleOptions(game).map((v) => ({ id: v.id, label: v.long })),
    classes: TT_GAMES[game].classes, server,
    rows, withRecord: rows.filter((r) => r.record).length, withMine: rows.filter((r) => r.mine != null).length,
    boardUrl: `${SITE_URL}${scope === "server" && s.gid ? serverPath(s.gid, game, cc, { items, vehicle }) : gamePath(game, cc, { items, vehicle })}`,
    readsLeft: left,
  };
}

export type ReadError = "not_image" | "store_failed" | "cap" | "not_configured" | "failed";

/** Stores a dropped screenshot as proof and reads it. Nothing is saved as a time here. */
export async function ttRoomRead(s: ActivitySession, bytes: Uint8Array, game: TtGame | null): Promise<{ ok: true; read: TtRoomRead } | { ok: false; error: ReadError }> {
  const picture = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata().then((m) => !!m.width).catch(() => false);
  if (!picture) return { ok: false, error: "not_image" };
  const actor = await actorOf(s);
  const shot = await storeScreenshot(bytes, actor.player.slice(2));
  if (!shot) return { ok: false, error: "store_failed" };
  const res = await readScreenshot({ jpeg: shot.jpeg, game, userId: actor.userId, capKey: `d:${s.did}` });
  if (!res.ok) return { ok: false, error: res.error };
  const r = res.read;
  const track = r.game && r.trackId && ttTrack(r.game, r.trackId) ? r.trackId : null;
  return {
    ok: true,
    read: {
      proofUrl: shot.url, preview: roomImg(shot.url), token: signRead({ url: shot.url, timeMs: r.timeMs, laps: r.laps }),
      game: r.game, track, cc: r.cc, timeMs: r.timeMs, notResult: r.notResult, readsLeft: res.left,
    },
  };
}

export type AddError = "not_ready" | "bad_track" | "bad_class" | "bad_time" | "bad_proof" | "faster_than_record" | "failed";

export async function ttRoomAdd(s: ActivitySession, input: { game: unknown; track: unknown; cc: unknown; items: unknown; vehicle?: unknown; time: unknown; proofUrl: unknown; token: unknown }): Promise<{ ok: true; saved: TtRoomSaved } | { ok: false; error: AddError }> {
  if (!(await ttReady())) return { ok: false, error: "not_ready" };
  const game = input.game === "mk8dx" || input.game === "mkworld" ? input.game : null;
  const track = game && typeof input.track === "string" ? ttTrack(game, input.track) : null;
  if (!game || !track) return { ok: false, error: "bad_track" };
  const cc = Number(input.cc ?? TT_GAMES[game].classes[0]);
  if (!isClassFor(game, cc)) return { ok: false, error: "bad_class" };
  const items: TtItems = input.items === "none" ? "none" : "shrooms";
  const vehicle = vehicleFor(game, input.vehicle);
  const timeMs = typeof input.time === "number" ? Math.round(input.time) : parseTime(String(input.time ?? ""));
  if (!timeMs || timeMs < MIN_MS || timeMs > MAX_MS) return { ok: false, error: "bad_time" };

  // The proof must be a screenshot this player stored through ttRoomRead.
  const actor = await actorOf(s);
  const proofUrl = typeof input.proofUrl === "string" ? input.proofUrl : "";
  const key = proofUrl ? keyFromPublicUrl(proofUrl) : null;
  if (!key || !key.startsWith(`time-trials/${actor.player.slice(2)}/`)) return { ok: false, error: "bad_proof" };
  const read = readFrom(input.token, proofUrl);

  const guildId = s.gid ?? null;
  if (guildId) await noteGuildPlayer(guildId, actor.player, await guildName(guildId));
  const prior = guildId ? await serverRecord(guildId, game, track.id, cc, items) : null;
  const res = await addTime({
    player: actor.player, userId: actor.userId, identityId: actor.identityId, game, track: track.id, cc, items, vehicle, timeMs,
    proof: "screenshot", proofUrl, readByAi: !!read?.timeMs && read.timeMs === timeMs, source: "discord", guildId,
    laps: read?.laps ?? null, readMs: read?.timeMs ?? null, readLaps: read?.laps ?? null,
  });
  if (!res.ok) return { ok: false, error: res.error === "bad_class" || res.error === "bad_track" || res.error === "not_ready" || res.error === "faster_than_record" ? res.error : "failed" };
  const recordPosted = guildId && prior ? await postServerRecord({ guildId, actor, track, cc, items, vehicle, timeMs, prior, res }).catch(() => false) : false;
  if (guildId) await refreshPanels(guildId, game).catch((err) => console.error("[tt room] panel refresh failed:", err));
  return { ok: true, saved: { best: res.best, previousMs: res.previousMs, place: res.place, total: res.total, server: res.server, needsVideo: res.needsVideo && !res.trusted, recordPosted } };
}
