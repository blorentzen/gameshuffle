/**
 * LiveSplit splits files (.lss), in and out (speedrun templates picks 2026-11-10, 4A and 5A).
 *   writeLss: a file with the game, category and split names (groups as LiveSplit's marks), no times: it opens in
 *             LiveSplit and LiveSplit One, and times fill in as the runner runs.
 *   readLss:  a runner's own file (LiveSplit One or the phone remote): names, the PB's split times, the best segments
 *             and the attempt count, so their PB is there from their first run on GameShuffle.
 * Plain text work on purpose (no XML library): runs in the browser and in tests. Pure, client-safe.
 */

import type { RelaySegment } from "./types";

export const LSS_MAX_BYTES = 4 * 1024 * 1024;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A splits file with no times. `names` as LiveSplit writes them (groups already marked). */
export function writeLss(o: { game: string; category: string; names: string[] }): string {
  const segs = o.names.map((n) => [
    "    <Segment>",
    `      <Name>${esc(n)}</Name>`,
    "      <Icon />",
    "      <SplitTimes>",
    '        <SplitTime name="Personal Best" />',
    "      </SplitTimes>",
    "      <BestSegmentTime />",
    "      <SegmentHistory />",
    "    </Segment>",
  ].join("\n"));
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Run version="1.7.0">',
    "  <GameIcon />",
    `  <GameName>${esc(o.game)}</GameName>`,
    `  <CategoryName>${esc(o.category)}</CategoryName>`,
    "  <LayoutPath>",
    "  </LayoutPath>",
    "  <Metadata>",
    '    <Run id="" />',
    '    <Platform usesEmulator="False">',
    "    </Platform>",
    "    <Region>",
    "    </Region>",
    "    <Variables />",
    "  </Metadata>",
    "  <Offset>00:00:00</Offset>",
    "  <AttemptCount>0</AttemptCount>",
    "  <AttemptHistory />",
    "  <Segments>",
    ...segs,
    "  </Segments>",
    "  <AutoSplitterSettings />",
    "</Run>",
    "",
  ].join("\n");
}

/** A file name for the download: "Mario Kart 8 Deluxe - 48 Tracks.lss" (characters Windows refuses taken out). */
export function lssFileName(game: string, category: string): string {
  const base = [game, category].map((s) => s.trim()).filter(Boolean).join(" - ") || "Splits";
  return `${base.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120)}.lss`;
}

function unesc(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

const tag = (xml: string, name: string): string | null => {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(xml);
  return m ? unesc(m[1]).trim() : null;
};

/** A LiveSplit time ("00:08:00.1000000", "1.02:03:04.5") to ms, or null. */
export function lssTime(input: string | null): number | null {
  if (!input) return null;
  const m = /^(?:(\d+)\.)?(\d+):(\d{1,2}):(\d{1,2})(?:\.(\d+))?$/.exec(input.trim());
  if (!m) return null;
  const [, days, h, min, sec, frac] = m;
  const ms = frac ? Math.floor(Number(`0.${frac}`) * 1000 + 1e-6) : 0;
  return (((Number(days ?? 0) * 24 + Number(h)) * 60 + Number(min)) * 60 + Number(sec)) * 1000 + ms;
}

/** A time inside a block: Real Time, else Game Time. */
const timeIn = (block: string | null): number | null => (block ? lssTime(tag(block, "RealTime")) ?? lssTime(tag(block, "GameTime")) : null);

export interface LssRun {
  game: string;
  category: string;
  attempts: number;
  /** Names as written (groups marked), the PB's cumulative split times and the Best Segments comparison (cumulative). */
  segments: RelaySegment[];
}

/** A runner's splits file, or null when it isn't one (or has no splits). */
export function readLss(xml: string): LssRun | null {
  if (typeof xml !== "string" || !/<Run[\s>]/.test(xml)) return null;
  const segBlocks = [...xml.matchAll(/<Segment>([\s\S]*?)<\/Segment>/g)].map((m) => m[1]);
  if (!segBlocks.length) return null;
  let bestSum: number | null = 0;
  const segments: RelaySegment[] = [];
  for (const b of segBlocks) {
    const name = (tag(b, "Name") ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
    const pbBlock = /<SplitTime\s+name="Personal Best"\s*>([\s\S]*?)<\/SplitTime>/.exec(b)?.[1] ?? null;
    const best = timeIn(/<BestSegmentTime>([\s\S]*?)<\/BestSegmentTime>/.exec(b)?.[1] ?? null);
    bestSum = bestSum != null && best != null ? bestSum + best : null;
    segments.push({ name: name || `Split ${segments.length + 1}`, pbMs: timeIn(pbBlock), bestMs: bestSum });
  }
  const attempts = Number(tag(xml, "AttemptCount") ?? 0);
  return {
    game: (tag(xml, "GameName") ?? "").replace(/\s+/g, " ").slice(0, 80),
    category: (tag(xml, "CategoryName") ?? "").replace(/\s+/g, " ").slice(0, 80),
    attempts: Number.isFinite(attempts) && attempts > 0 ? Math.min(999_999, Math.floor(attempts)) : 0,
    segments: segments.slice(0, 500),
  };
}
