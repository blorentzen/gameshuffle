import "server-only";

/**
 * The War room (GameShuffle Competitive's Activity; picks 2026-11-01, https://claude.ai/artifact/LKB8iApfE2Tqg1yhivbj53,
 * all as recommended): which war a launch shows, its view, and what people in the room can do. Every action goes
 * through the same store functions as the war card's buttons, then redraws the card (a race that went in moves it to
 * the bottom), so the channel and the room never disagree.
 *   Which war (pick 2A): the war in the channel the app was opened in (the card's War room button opens it there);
 *   from a voice call, the war this call picked before (a `room:<instance>` note on the war), else the server's only
 *   live war, else a short list, else Start a war.
 */

import { SITE_URL } from "@/lib/seo";
import { trackCode } from "@/lib/timeTrials/codes";
import { ttTracks } from "@/lib/timeTrials/tracks";
import type { ActivitySession } from "@/lib/activity/session";
import { channelLabel } from "./channelLabel";
import { warPagePath } from "./page";
import { readTrack, standing, warTrack, type WarGame, type WarSide } from "./rules";
import {
  addPenalty, addRace, endWar, getWar, latestWar, latestWarIn, liveWar, liveWarsIn, markRoom, pendingTrack, rememberChannel,
  replaceRace, setPendingTrack, setTrack, startWar, tapPlace, undoRace, warChannel, type War, type WarTeamRef,
} from "./store";
import { answersFor, cansReady, lineupNow } from "@/lib/cans/store";
import { headlineFor, leads, playerRows, tapGrid, waitingOn, type RoomTrack, type WarRoomView } from "./roomView";
import { playedTeams, searchRegistry } from "./teams";

/** A finished war stays on the room's screen this long, for the final view. */
const KEEP_MS = 3 * 3600_000;
const IMG_HOSTS = /^https:\/\/(?:www\.)?(?:mkcentral\.com|gs-ugc\.empac\.co|cdn\.discordapp\.com)\//;

/**
 * Discord only loads the Activity's own address, so pictures from elsewhere come through ours: the course art through
 * the /images/cdn rewrite, logos and avatars through /api/activity/img.
 */
export function roomImg(url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("/")) return url;
  const cdn = url.match(/^https:\/\/cdn\.empac\.co\/gameshuffle\/images\/(.+)$/);
  if (cdn) return `/images/cdn/${cdn[1]}`;
  return IMG_HOSTS.test(url) ? `/api/activity/img?u=${encodeURIComponent(url)}` : null;
}

export function roomTrack(game: WarGame, id: string | null): RoomTrack | null {
  const t = id ? warTrack(game, id) : null;
  return t ? { id: t.id, code: trackCode(t), name: t.name, image: roomImg(t.image) } : null;
}

/** Every course in the game, for the track picker, in cup order. */
export function roomTracks(game: WarGame): (RoomTrack & { cup: string })[] {
  return ttTracks(game).map((t) => ({ id: t.id, code: trackCode(t), name: t.name, cup: t.cup, image: roomImg(t.image) }));
}

const team = (t: WarTeamRef, total: number) => ({ tag: t.tag, name: t.name, logo: roomImg(t.logo), total });

export function roomView(war: War, viewerId: string): WarRoomView {
  const s = standing(war.races, war.penalties, war.racesTotal);
  const us = team(war.us, s.us);
  const them = team(war.them, s.them);
  const lead = leads(war.races, war.penalties);
  const n = war.races.length + 1;
  const taps = war.taps.filter((t) => t.race === n);
  const grid = tapGrid(taps);
  const { rows, byHand } = playerRows(war.races, war.racesTotal);
  const live = war.status === "live";
  const top = rows[0] ?? null;
  return {
    id: war.id,
    status: war.status,
    game: war.game,
    racesTotal: war.racesTotal,
    us, them,
    diff: s.diff, diffs: s.diffs, played: s.played, left: s.left, decided: s.decided, need: s.need,
    race: live ? {
      n,
      track: roomTrack(war.game, pendingTrack(war, n)),
      taps: grid.taps,
      clashes: grid.clashes,
      waiting: waitingOn(war.races, taps),
      count: taps.length,
      mine: taps.find((t) => t.id === viewerId)?.place ?? null,
    } : null,
    races: war.races.map((r, i) => ({ n: r.n, track: roomTrack(war.game, r.track), spots: r.spots, diff: s.diffs[i] ?? 0, lead: lead[i] ?? 0, by: r.by.name, tapped: !!r.players?.length })),
    players: rows,
    byHand,
    penalties: war.penalties.map((p) => ({ side: p.side, points: p.points, reason: p.reason })),
    headline: headlineFor(war.status, s.played, war.racesTotal, us, them),
    topPlayer: !live && top ? { name: top.name, points: top.points } : null,
    cardUrl: war.cardMessageId ? `https://discord.com/channels/${war.guildId}/${war.channelId}/${war.cardMessageId}` : null,
    pageUrl: `${SITE_URL}${warPagePath(war)}`,
    channelId: war.channelId,
    undo: war.races.length && war.status !== "ended" ? war.races[war.races.length - 1].n : null,
  };
}

export interface RoomWarChoice { id: string; us: { tag: string; name: string | null; logo: string | null }; them: { tag: string; name: string | null; logo: string | null }; channel: string | null; played: number; racesTotal: number; diff: number }
/** A lineup locked with /cans for a war starting about now in this channel (cans picks 2026-11-04, 15A): the War room
 *  opens with it. Names only. */
export interface RoomLineup { vs: string | null; tag: string | null; at: string; players: string[]; subs: string[] }
export interface RoomStart { channelId: string; channel: string | null; us: { tag: string; name: string | null; logo: string | null } | null; game: WarGame; lineup: RoomLineup | null }

export type RoomState =
  | { kind: "war"; view: WarRoomView }
  | { kind: "pick"; wars: RoomWarChoice[]; start: RoomStart }
  | { kind: "none"; start: RoomStart }
  | { kind: "nowhere" };

const recent = (w: War) => w.status === "live" || Date.now() - Date.parse(w.endedAt ?? w.updatedAt) < KEEP_MS;

/** Where a war started from the room goes: this channel if it has had wars, else the server's last war channel, else here. */
async function startTarget(guildId: string, channelId: string): Promise<RoomStart> {
  const [here, last, locked] = await Promise.all([warChannel(guildId, channelId), latestWarIn(guildId), cansReady().then((ok) => (ok ? lineupNow(guildId, channelId) : null)).catch(() => null)]);
  const target = here ? channelId : last?.channelId ?? channelId;
  const [ch, label] = await Promise.all([target === channelId ? Promise.resolve(here) : warChannel(guildId, target), channelLabel(guildId, target)]);
  const us = ch?.team ?? null;
  let lineup: RoomLineup | null = null;
  if (locked?.lineup) {
    const names = new Map((await answersFor(locked.id)).map((r) => [r.userId, r.name]));
    const name = (id: string) => names.get(id) ?? "A player";
    lineup = { vs: locked.vs, tag: locked.teamTag, at: locked.startsAt, players: locked.lineup.players.map(name), subs: locked.lineup.subs.map(name) };
  }
  return { channelId: target, channel: label.channel, us: us ? { tag: us.tag, name: us.name, logo: roomImg(us.logo) } : null, game: ch?.game ?? last?.game ?? "mk8dx", lineup };
}

/** The war this launch shows (pick 2A). `hint` is the war the viewer's screen is on, kept while it's still in this server. */
export async function roomState(session: ActivitySession, hint: string | null = null): Promise<RoomState> {
  const guildId = session.gid ?? null;
  const channelId = session.cid ?? null;
  if (!guildId || !channelId) return { kind: "nowhere" };
  const show = (w: War): RoomState => ({ kind: "war", view: roomView(w, session.did) });

  if (hint) {
    const w = await getWar(hint);
    if (w && w.guildId === guildId && recent(w)) return show(w);
  }
  const here = (await liveWar(guildId, channelId)) ?? (await latestWar(guildId, channelId));
  if (here && recent(here)) return show(here);

  const lives = await liveWarsIn(guildId);
  const picked = session.ins ? lives.find((w) => w.notes.includes(`room:${session.ins}`)) : null;
  if (picked) return show(picked);
  if (lives.length === 1) return show(lives[0]);
  if (lives.length > 1) {
    const labels = await Promise.all(lives.map((w) => channelLabel(w.guildId, w.channelId).catch(() => ({ channel: null, server: null }))));
    return {
      kind: "pick",
      start: await startTarget(guildId, channelId),
      wars: lives.map((w, i) => {
        const s = standing(w.races, w.penalties, w.racesTotal);
        return { id: w.id, us: { tag: w.us.tag, name: w.us.name, logo: roomImg(w.us.logo) }, them: { tag: w.them.tag, name: w.them.name, logo: roomImg(w.them.logo) }, channel: labels[i].channel, played: s.played, racesTotal: w.racesTotal, diff: s.diff };
      }),
    };
  }
  return { kind: "none", start: await startTarget(guildId, channelId) };
}

/** Teams for the start form: ones this server has played, then MKCentral's. */
export async function roomTeams(guildId: string, q: string, game: WarGame): Promise<{ tag: string; name: string | null; logo: string | null; from: string }[]> {
  const lower = q.trim().toLowerCase();
  const played = (await playedTeams(guildId).catch(() => []))
    .filter((t) => !lower || t.tag.toLowerCase().startsWith(lower) || (t.name ?? "").toLowerCase().includes(lower))
    .slice(0, 6)
    .map((t) => ({ tag: t.tag, name: t.name, logo: roomImg(t.logo), from: "Played here" }));
  const seen = new Set(played.map((t) => t.tag.toLowerCase()));
  const reg = lower ? (await searchRegistry(q.trim(), game).catch(() => []))
    .filter((t) => !seen.has(t.tag.toLowerCase()) && (seen.add(t.tag.toLowerCase()), true))
    .slice(0, 8 - played.length)
    .map((t) => ({ tag: t.tag, name: t.name, logo: roomImg(t.logo), from: "MKCentral" })) : [];
  return [...played, ...reg];
}

export type RoomAction =
  | { action: "tap"; war: string; n: number; place: number }
  | { action: "track"; war: string; n: number; track: string }
  | { action: "fill"; war: string; n: number; places: number[] }
  | { action: "fix"; war: string; n: number; places: number[]; track?: string | null }
  | { action: "undo"; war: string; n: number }
  | { action: "penalty"; war: string; side: WarSide; points: number; reason?: string }
  | { action: "end"; war: string }
  | { action: "rematch"; war: string }
  | { action: "pick"; war: string }
  | { action: "start"; vs: string; us?: string; game: WarGame };

/** What the card needs after an action: move it to the bottom (a race went in, a war started or ended) or redraw it. */
export type CardWork = { war: string; move: boolean } | null;
export type ActionResult = { ok: true; war: War; card: CardWork; note?: string } | { ok: false; error: string; message: string };

const fail = (error: string, message: string): ActionResult => ({ ok: false, error, message });
const cleanPlaces = (list: unknown): number[] | null => {
  if (!Array.isArray(list)) return null;
  const places = [...new Set(list.map(Number))].filter((p) => Number.isInteger(p) && p >= 1 && p <= 12).sort((a, b) => a - b);
  return places.length === 6 ? places : null;
};
const cleanTag = (v: unknown) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, 12);

export async function roomAction(session: ActivitySession, body: RoomAction): Promise<ActionResult> {
  const guildId = session.gid;
  if (!guildId) return fail("nowhere", "The War room works in a server's channel or call.");
  const by = { id: session.did, name: session.name.slice(0, 32) };

  if (body.action === "start") {
    if (!session.cid) return fail("nowhere", "Start a war from a server's channel or call.");
    const where = await startTarget(guildId, session.cid);
    const live = await liveWar(guildId, where.channelId);
    if (live) return { ok: true, war: live, card: null, note: "A war is already on there, so the room opened it." };
    const them = cleanTag(body.vs);
    const usTag = cleanTag(body.us) || where.us?.tag || "";
    if (!them) return fail("no_vs", "Who are you playing? Pick a team or type their tag.");
    if (!usTag) return fail("no_us", "Type your team's tag. The channel remembers it after this.");
    if (usTag.toLowerCase() === them.toLowerCase()) return fail("same", "Your team and theirs have the same tag.");
    const game: WarGame = body.game === "mkworld" ? "mkworld" : "mk8dx";
    const { teamRef } = await import("@/lib/discord/commands/war");
    const remembered = (await warChannel(guildId, where.channelId))?.team ?? null;
    const [us, opp] = await Promise.all([teamRef(guildId, usTag, game, remembered), teamRef(guildId, them, game, null)]);
    const started = await startWar({ guildId, channelId: where.channelId, game, entry: "taps", us, them: opp, by });
    if (!started.ok) return started.error === "live" ? { ok: true, war: started.war, card: null } : fail("failed", "The war couldn't start. Try again in a moment.");
    await rememberChannel(guildId, where.channelId, { team: us, game });
    return { ok: true, war: started.war, card: { war: started.war.id, move: true } };
  }

  const war = await getWar(body.war);
  if (!war || war.guildId !== guildId) return fail("gone", "That war isn't in this server any more.");
  const next = war.races.length + 1;

  switch (body.action) {
    case "pick": {
      if (session.ins) await markRoom(war.id, session.ins);
      return { ok: true, war, card: null };
    }
    case "tap": {
      const place = Number(body.place);
      if (!(place >= 1 && place <= 12)) return fail("place", "That place isn't on the board.");
      const res = await tapPlace(war.id, { n: Number(body.n), place, user: by });
      if (!res.ok) {
        if (res.error === "stale") return fail("stale", `Race ${body.n} is already in.`);
        if (res.error === "full") return fail("full", "Six places are in already. Tap one of them to change it, or use Fill in the rest.");
        return fail("over", "This war is over.");
      }
      return { ok: true, war: res.war, card: { war: war.id, move: !!res.result.race } };
    }
    case "track": {
      const t = warTrack(war.game, body.track) ?? readTrack(war.game, body.track);
      if (!t) return fail("track", "That track isn't in this game.");
      const n = Number(body.n);
      const res = war.races.some((r) => r.n === n) ? await setTrack(war.id, n, t.id) : await setPendingTrack(war.id, n, t.id);
      if (!res.ok) return fail("stale", "That race has moved on.");
      return { ok: true, war: res.war, card: { war: war.id, move: false } };
    }
    case "fill": {
      const spots = cleanPlaces(body.places);
      if (!spots) return fail("places", "Pick six different places.");
      if (Number(body.n) !== next) return fail("stale", `Race ${body.n} is already in.`);
      const players = war.taps.filter((t) => t.race === next && spots.includes(t.place)).map((t) => ({ id: t.id, name: t.name, place: t.place }));
      const unique = players.filter((p, i) => players.findIndex((q) => q.place === p.place) === i);
      const res = await addRace(war.id, { n: next, spots, track: pendingTrack(war, next), by, ...(unique.length ? { players: unique } : {}) });
      if (!res.ok) return fail(res.error, res.error === "taken" ? `Race ${next} went in a moment ago.` : "This war is over.");
      return { ok: true, war: res.war, card: { war: war.id, move: true } };
    }
    case "fix": {
      const spots = cleanPlaces(body.places);
      if (!spots) return fail("places", "Pick six different places.");
      const t = body.track ? warTrack(war.game, body.track) : null;
      const res = await replaceRace(war.id, { n: Number(body.n), spots, ...(t ? { track: t.id } : {}), by });
      if (!res.ok) return fail("gone", "That race isn't there any more.");
      return { ok: true, war: res.war, card: { war: war.id, move: false } };
    }
    case "undo": {
      const res = await undoRace(war.id, Number(body.n), by.name);
      if (!res.ok) return fail(res.error, res.error === "not_last" ? `Race ${body.n} isn't the last race any more. Use Fix a race instead.` : "There's no race to take back.");
      return { ok: true, war: res.war, card: { war: war.id, move: true } };
    }
    case "penalty": {
      const points = Number(body.points);
      if (!Number.isInteger(points) || points < 1 || points > 200) return fail("points", "Points off should be a whole number from 1 to 200.");
      const res = await addPenalty(war.id, { side: body.side === "us" ? "us" : "them", points, reason: String(body.reason ?? "").trim().slice(0, 40), by: by.name });
      if (!res.ok) return fail("over", "This war is over.");
      return { ok: true, war: res.war, card: { war: war.id, move: false } };
    }
    case "end": {
      const res = await endWar(war.id);
      if (!res.ok) return fail("over", "This war is already over.");
      return { ok: true, war: res.war, card: { war: war.id, move: true } };
    }
    case "rematch": {
      const live = await liveWar(war.guildId, war.channelId);
      if (live) return { ok: true, war: live, card: null };
      const started = await startWar({ guildId: war.guildId, channelId: war.channelId, game: war.game, entry: war.entry, us: war.us, them: war.them, by });
      if (!started.ok) return started.error === "live" ? { ok: true, war: started.war, card: null } : fail("failed", "The rematch couldn't start. Try again in a moment.");
      return { ok: true, war: started.war, card: { war: started.war.id, move: true } };
    }
  }
  return fail("unknown", "Unknown action.");
}

