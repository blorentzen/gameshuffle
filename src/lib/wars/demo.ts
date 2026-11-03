/**
 * A made-up war for previews (the overlay setup page and the war piece in the Layout editor): twelve races between the
 * channel's teams, stopped at a moment the preview can play. Client-safe.
 */

import type { WarLiveData } from "./types";

export type DemoTeam = { tag: string; name: string | null; logo: string | null };
export type DemoMoment = "now" | "race" | "caught" | "final";

export const DEMO_DIFFS = [20, 26, -12, 16, 20, 16, -8, 4, -14, 2, -6, -4];
const TRACKS = ["bPP", "bRA", "CC", "TH", "rMMM", "SSC", "dYC", "bNYM", "rRRy", "MKS", "rDKJ", "RR"];

export const DEMO_TEAMS: { us: DemoTeam; them: DemoTeam } = {
  us: { tag: "KC", name: "Kart Club", logo: null },
  them: { tag: "NOR", name: "Night Owls", logo: null },
};

export function demoWar(teams: { us: DemoTeam; them: DemoTeam } = DEMO_TEAMS, demo: DemoMoment = "now"): WarLiveData {
  const played = demo === "final" ? 12 : demo === "caught" ? 11 : demo === "race" ? 7 : 6;
  const diffs = DEMO_DIFFS.slice(0, played);
  const sum = diffs.reduce((a, b) => a + b, 0);
  const us = (82 * played + sum) / 2;
  const left = 12 - played;
  const lead = Math.abs(sum);
  const decided = played === 12 || lead > 40 * left ? (sum > 0 ? "us" : "them") : null;
  return {
    id: "demo", status: played === 12 ? "done" : "live", game: "mk8dx", racesTotal: 12,
    us: { ...teams.us, total: us, color: "" }, them: { ...teams.them, total: 82 * played - us, color: "" },
    diffs, played, left, decided: decided as WarLiveData["decided"],
    need: decided || !left || !sum ? null : { side: sum > 0 ? "them" : "us", avg: Math.ceil((lead + 1) / left) },
    last: { n: played, track: TRACKS[played - 1], diff: diffs[played - 1], spots: [1, 2, 3, 7, 9, 11] },
    penalty: null, updatedAt: "",
  };
}
