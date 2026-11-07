/**
 * Highlights on a profile (context + rooms picks 2026-11-05, 7A, https://claude.ai/artifact/APK5x7mRj9Ldvt7a8J7g4T):
 * rings for what someone is proud of (a track record, a division, a streak, a region cleared). The page shows the
 * automatic ones until the owner pins their own (up to five, in their order; `profile_layout.highlights`). Badges
 * they've earned (series wins, Weekly top 10, Founding Brain) are already said under their name, so they aren't rings.
 * Client-safe and pure: the page builds the candidates from what it has already read.
 */

import { ttTrack, trackPath, type TtClass, type TtGame } from "@/lib/timeTrials/tracks";
import { DAILIES } from "@/lib/originals/dailies";
import { medalSrc } from "@/lib/mmr/medals";
import { divisionLook } from "@/lib/mmr/look";

import { MAX_HIGHLIGHTS } from "./layout";

export { MAX_HIGHLIGHTS, cleanHighlightIds } from "./layout";

export type HighlightTone = "gold" | "shuffle" | "dex" | "fire" | "duel" | "teal";
export type HighlightIcon = "trophy" | "flame" | "route" | "crown";

export type HighlightArt =
  /** A picture filling the ring: a course (its name strip cropped away) or a division medal (whole, on white). */
  | { kind: "img"; src: string; fit: "cover" | "medal" }
  | { kind: "glyph"; icon: HighlightIcon; tone: HighlightTone };

export interface Highlight {
  id: string;
  label: string;
  href: string;
  art: HighlightArt;
  /** A division medal is MKCentral's art: the page credits it where it shows. */
  medal?: boolean;
}

type DailyId = "shuffle" | "dex" | "fire" | "duel";
const DAILY_TONE: Record<DailyId, HighlightTone> = { shuffle: "shuffle", dex: "dex", fire: "fire", duel: "duel" };
const DAILY_NAME: Record<DailyId, string> = { shuffle: "Shuffle", dex: "Dex", fire: "Fire Round", duel: "Duel" };

export interface HighlightInput {
  /** Their first places on the time trial boards. */
  records: { game: TtGame; track: string; cc: TtClass }[];
  /** Current streak per daily. */
  streaks: Partial<Record<DailyId, number>>;
  /** Their lounge division, when their MMR card shows on the profile. */
  division: { name: string; game: string } | null;
  /** Trainer Road: regions cleared, badges, Champion. */
  road: { regionsCleared: number; badges: number; champion: boolean; firstRegion: string | null } | null;
}

/** Every highlight they could show, in the automatic order (best first). */
export function highlightCandidates(p: HighlightInput): Highlight[] {
  const out: Highlight[] = [];
  for (const r of p.records) {
    const t = ttTrack(r.game, r.track);
    if (!t) continue;
    out.push({
      id: `tt:${r.game}:${r.track}`, label: `${t.name} record`, href: trackPath(t, r.cc),
      art: t.image ? { kind: "img", src: t.image, fit: "cover" } : { kind: "glyph", icon: "trophy", tone: "gold" },
    });
  }
  if (p.division && p.division.name !== "Placement") {
    const medal = medalSrc(divisionLook(p.division.name).base);
    out.push({
      id: `mmr:${p.division.game}`, label: p.division.name, href: "#mmr",
      art: medal ? { kind: "img", src: medal, fit: "medal" } : { kind: "glyph", icon: "crown", tone: "gold" }, medal: !!medal,
    });
  }
  const streaks = (Object.entries(p.streaks) as [DailyId, number][]).filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]);
  for (const [g, n] of streaks) {
    out.push({ id: `streak:${g}`, label: `${n}-day ${DAILY_NAME[g]} streak`, href: DAILIES[g]?.href ?? "/daily", art: { kind: "glyph", icon: "flame", tone: DAILY_TONE[g] } });
  }
  if (p.road && (p.road.champion || p.road.regionsCleared > 0 || p.road.badges > 0)) {
    const label = p.road.champion ? "Trainer Road Champion"
      : p.road.regionsCleared === 1 && p.road.firstRegion ? `${p.road.firstRegion} cleared`
        : p.road.regionsCleared > 1 ? `${p.road.regionsCleared} regions cleared`
          : `${p.road.badges} ${p.road.badges === 1 ? "badge" : "badges"}`;
    out.push({ id: "road", label, href: "#road", art: { kind: "glyph", icon: "route", tone: "duel" } });
  }
  // Records lead, but no more than two of them before the rest get a turn.
  const records = out.filter((h) => h.id.startsWith("tt:"));
  const rest = out.filter((h) => !h.id.startsWith("tt:"));
  return [...records.slice(0, 2), ...rest, ...records.slice(2)];
}

/** What shows: their pinned ones that still exist, in their order; else the first five automatic ones. */
export function shownHighlights(candidates: Highlight[], pinned: string[] | null): Highlight[] {
  if (!pinned) return candidates.slice(0, MAX_HIGHLIGHTS);
  const byId = new Map(candidates.map((h) => [h.id, h]));
  return pinned.map((id) => byId.get(id)).filter((h): h is Highlight => !!h).slice(0, MAX_HIGHLIGHTS);
}
