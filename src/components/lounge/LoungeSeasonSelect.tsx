"use client";

/**
 * The season picker beside the game pills (lounge page picks, 2026-10-20): a CascadeDS Select
 * that opens that season's whole page. The tab the reader is on comes along (it lives in the
 * address, so it's read at the moment of the change).
 */

import { useRouter } from "next/navigation";
import { Select } from "@empac/cascadeds";
import { seasonLabel } from "@/lib/lounge/season";

export function LoungeSeasonSelect({ seasons, season, current, basePath }: {
  seasons: number[];
  season: number;
  current: number | null;
  /** The page for this player and game without a season ("/lounge/Kevo?game=mk8dx"). */
  basePath: string;
}) {
  const router = useRouter();
  if (seasons.length < 2) return null;
  const go = (value: string | string[]) => {
    const s = Number(Array.isArray(value) ? value[0] : value);
    if (!Number.isInteger(s) || s === season) return;
    const url = new URL(basePath, window.location.origin);
    if (s !== current) url.searchParams.set("season", String(s));
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab) url.searchParams.set("tab", tab);
    router.push(`${url.pathname}${url.search}`);
  };
  return (
    <div className="lounge-season">
      <Select
        floatingLabel="Season"
        value={String(season)}
        onChange={go}
        options={seasons.map((s) => ({ value: String(s), label: seasonLabel(s, current) }))}
        size="medium"
      />
    </div>
  );
}
