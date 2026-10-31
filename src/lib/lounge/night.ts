/**
 * One lounge night, picked out of a season (pure, client-safe): what "Share the night"
 * (lounge night picks, 2026-10-20) puts on its picture card. A night runs 6am to 6am Pacific
 * (season.ts `nights`); the recap is worked out as the night stood when it ended, so a night
 * shared a few days later still shows the number and division it finished on.
 */

import { signed, type MmrSource } from "@/lib/mmr/rules";
import { nightRecap, type NightRecap } from "./recap";
import { nights } from "./season";

export interface PickedNight {
  /** The night's Pacific day (YYYY-MM-DD). */
  day: string;
  start: string;
  end: string;
  recap: NightRecap;
}

/** A night by its day, or the latest night with events. Null when there's none. */
export function nightFor(src: Pick<MmrSource, "changes" | "steps" | "mmr" | "division">, day?: string | null): PickedNight | null {
  const list = nights(src.changes);
  const n = day ? list.find((x) => x.day === day) : list[0];
  if (!n) return null;
  const end = Date.parse(n.end);
  // Changes after the night are left out, so the recap ends where the night did.
  const upTo = src.changes.filter((c) => Date.parse(c.at) <= end);
  const latest = upTo.length === src.changes.length;
  const recap = nightRecap({
    changes: upTo,
    since: n.start,
    steps: src.steps,
    mmr: latest ? src.mmr ?? upTo[0]?.mmr ?? null : upTo[0]?.mmr ?? null,
    division: latest ? src.division : null,
  });
  return { day: n.day, start: n.start, end: n.end, recap };
}

/** The words that go with a night's picture: "Kevo's lounge night: +180, 5-1, into Master", the squares and the link. */
export function loungeShareText(name: string, recap: Pick<NightRecap, "net" | "wins" | "losses" | "squares" | "newDivisions"> | null | undefined, url: string): string {
  if (!recap) return `My Mario Kart lounge night on GameShuffle\n${url}`;
  const into = recap.newDivisions.length ? `, into ${recap.newDivisions[recap.newDivisions.length - 1]}` : "";
  // The dailies' squares: a win, a gain to a new season peak, a loss.
  const squares = recap.squares.slice(-12).map((m) => (m === "w" ? "🟩" : m === "p" ? "🟨" : "⬛")).join("");
  return `${name}'s lounge night: ${signed(recap.net)}, ${recap.wins}-${recap.losses}${into}\n${squares}\n${url}`;
}
