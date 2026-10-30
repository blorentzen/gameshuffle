import "server-only";

/**
 * Share images for the competitive Mario Kart pages (SEO pass, 2026-10-30): a time trial track's board
 * (its picture, the record and how many players) and a lounge player (division, MMR, world rank).
 * Both fall back to a plain card when the data can't be read in time.
 */

import { pictureArt, type EventCardInput } from "./eventCard";
import { describePlayers } from "@/lib/daily/boards";
import { trackSummary } from "@/lib/timeTrials/store";
import { formatTime } from "@/lib/timeTrials/rules";
import { categoryText } from "@/lib/timeTrials/categories";
import { gameBySlug, trackBySegment, TT_GAMES } from "@/lib/timeTrials/tracks";
import { suggestPlayers } from "@/lib/lounge/lookupServer";
import { normName, fmtNum } from "@/lib/lounge/lookup";
import { divisionLook } from "@/lib/mmr/look";
import { MMR_GAMES } from "@/lib/mmr/rules";

const TT_GLYPHS: EventCardInput["glyphs"] = ["stopwatch", "flag", "trophy"];
const LOUNGE_GLYPHS: EventCardInput["glyphs"] = ["trophy", "crown", "steering-wheel"];
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function timeTrialsFallback(gameLabel?: string): EventCardInput {
  return { kicker: gameLabel ? `Time trials · ${gameLabel}` : "Mario Kart time trials", title: "Every track's best times", art: null, glyphs: TT_GLYPHS, accent: "#2766ec" };
}

/** A track's board on its default category (150cc or the game's only class, with mushrooms, any vehicle). */
export async function trackCard(gameSlug: string, segment: string): Promise<EventCardInput> {
  const info = gameBySlug(gameSlug);
  const track = info ? trackBySegment(info.id, segment) : null;
  if (!info || !track) return timeTrialsFallback();
  const cc = info.classes[0];
  const [summary, art] = await Promise.all([
    trackSummary(info.id, "shrooms", "any").catch(() => []),
    pictureArt(track.image, { trimBottom: 0.16 }),
  ]);
  const s = summary.find((x) => x.track === track.id && x.cc === cc);
  const holder = s ? (await describePlayers([s.recordPlayer])).get(s.recordPlayer)?.name ?? "A player" : null;
  const meta: EventCardInput["meta"] = s
    ? [{ icon: "trophy", text: `Record ${formatTime(s.recordMs)} by ${holder}` }, { icon: "users", text: plural(s.players, "player") }]
    : [{ icon: "stopwatch", text: "No times yet. Add the first." }];
  return {
    kicker: `Time trials · ${info.label}`,
    title: track.name,
    when: categoryText(info.id, cc, "shrooms", "any", TT_GAMES[info.id].classes.length > 1).replace(/^./, (c) => c.toUpperCase()),
    meta,
    art,
    glyphs: TT_GLYPHS,
    accent: "#2766ec",
  };
}

export function loungeFallback(): EventCardInput {
  return { kicker: "Mario Kart lounge", title: "Any lounge player's season", art: null, glyphs: LOUNGE_GLYPHS, accent: "#23798c" };
}

/** A lounge player in their best game this season (the page's default when no game is picked). */
export async function loungeCard(rawName: string): Promise<EventCardInput> {
  const name = decodeURIComponent(rawName).trim();
  if (!name) return loungeFallback();
  const found = await suggestPlayers(name).catch(() => []);
  const s = found.find((x) => normName(x.name) === normName(name));
  if (!s) return { ...loungeFallback(), title: name.slice(0, 40) };
  const p = s.primary;
  const d = divisionLook(s.played ? p.division ?? "Placement" : "Placement");
  const meta: EventCardInput["meta"] = [];
  if (p.rank) meta.push({ icon: "world", text: `#${fmtNum(p.rank)} in ${MMR_GAMES[p.game].short}` });
  if (p.events) meta.push({ icon: "flag", text: plural(p.events, "event") });
  return {
    kicker: `Mario Kart lounge · ${MMR_GAMES[p.game].short}`,
    title: s.name,
    when: s.played ? [p.division, p.mmr != null ? `${fmtNum(p.mmr)} MMR` : null].filter(Boolean).join(" · ") : "No events this season",
    meta,
    art: null,
    glyphs: LOUNGE_GLYPHS,
    accent: d.c2,
  };
}
