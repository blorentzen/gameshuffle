/**
 * The community's Mario Kart 8 Deluxe Top 10 sheets (picks 2026-11-04, https://claude.ai/artifact/SGSXW3sBrn6GJSinYimSnc,
 * all as recommended; the sheet keepers agreed). Pure: reading a sheet's published CSV and the proof links on its
 * published page. The daily read that saves them is sheetSync.ts.
 *
 * Each sheet has a tab per speed class. A tab is a stack of sections: the world's top ten first (no label), then each
 * country's top ten under a label row ("USA", "Japan" ...). A section is a grid of four tracks a row: the track names,
 * then ten rows of place, name and time per track (five cells per track), with the overall points on the right.
 * The Inward sheet has the world section only. Base Game and Booster Course Pass count on the open boards, Inward on
 * Inside drift; all of them are mushrooms.
 */

import { parseTime } from "./rules";
import { ttTracks, type TtClass } from "./tracks";
import type { TtVehicle } from "./categories";

export type SheetId = "base" | "bcp" | "inward";

export interface TtSheet {
  id: SheetId;
  label: string;
  /** The published document's key (docs.google.com/spreadsheets/d/e/<key>/pubhtml). */
  doc: string;
  /** The tab for each speed class. */
  gids: Record<TtClass, string>;
  vehicle: TtVehicle;
}

export const TT_SHEETS: TtSheet[] = [
  { id: "base", label: "Base Game Top 10", doc: "2PACX-1vR9QwVZqKkE6OyMlASz-WDPJVicqHKUwSy_kRZ10mhtjY1E7BLBC3onMyCcFj7sshzyHrH58wFIbVD7", gids: { 150: "986788593", 200: "824303565" }, vehicle: "any" },
  { id: "bcp", label: "Booster Course Pass Top 10", doc: "2PACX-1vQU6WFWaMCIgqguPsDGtRaP3gJkg-77gug2Q8WJ9geIlF8Vn9Ewr67V6S2Ulocn44jkt3nCGgyIIfLH", gids: { 150: "986788593", 200: "824303565" }, vehicle: "any" },
  { id: "inward", label: "Inward Top 10", doc: "2PACX-1vSwzNdYYGctiQsu9PQSXWIuIHnDPMNh8NbPDZzzW5A7Xb41xeYYq-F8WKFQPkJ3Ddif9eA5cX9reDXv", gids: { 150: "1365429770", 200: "1572140975" }, vehicle: "inside_drift" },
];

export const sheetById = (id: string): TtSheet | null => TT_SHEETS.find((s) => s.id === id) ?? null;

/** The sheet a Mario Kart 8 Deluxe board's times come from: Inward for Inside drift, else the base game's 48 tracks or the Booster Course Pass's. */
export function sheetFor(track: string, vehicle: TtVehicle): TtSheet {
  if (vehicle === "inside_drift") return TT_SHEETS[2];
  const i = ttTracks("mk8dx").findIndex((t) => t.id === track);
  return i >= 48 ? TT_SHEETS[1] : TT_SHEETS[0];
}
export const sheetPage = (s: TtSheet): string => `https://docs.google.com/spreadsheets/d/e/${s.doc}/pubhtml`;
export const sheetCsvUrl = (s: TtSheet, cc: TtClass): string => `https://docs.google.com/spreadsheets/d/e/${s.doc}/pub?gid=${s.gids[cc]}&single=true&output=csv`;
export const sheetHtmlUrl = (s: TtSheet, cc: TtClass): string => `https://docs.google.com/spreadsheets/d/e/${s.doc}/pubhtml/sheet?headers=false&gid=${s.gids[cc]}`;

/** The country sections' labels. The world section (first, unlabeled) has none. */
export const SHEET_COUNTRIES: Record<string, string> = {
  usa: "us", japan: "jp", france: "fr", spain: "es", uk: "gb", germany: "de", canada: "ca", australia: "au",
};

/** A player's name as the sheets' key: the same spelling on every sheet is the same player. */
export function sheetNameKey(name: string): string {
  return name.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

/** A tidy display name (the sheets sometimes add a country tag like "Miguel [US]"; it stays, it's part of the name there). */
export const sheetDisplayName = (name: string): string => name.normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, 60);

// ── Tracks ────────────────────────────────────────────────────────────────────

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
// The sheets' own spellings: a typo, and "GCN Cheese Land" where the game says GBA.
const TRACK_ALIAS: Record<string, string> = { "hyrule cicuit": "hyrule circuit", "gcn cheese land": "gba cheese land" };
let byName: Map<string, string> | null = null;

/** Our track id for a sheet's track name, or null. */
export function sheetTrackId(name: string): string | null {
  if (!byName) {
    byName = new Map(ttTracks("mk8dx").map((t) => [norm(t.name), t.id]));
    for (const [a, b] of Object.entries(TRACK_ALIAS)) if (byName.has(b)) byName.set(a, byName.get(b)!);
  }
  return byName.get(norm(name)) ?? null;
}

// ── CSV ───────────────────────────────────────────────────────────────────────

/** A CSV file's rows (quoted cells, doubled quotes and line breaks inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === "") quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export interface SheetEntry {
  /** "world", or the country code of the section it was in. */
  section: string;
  /** Our track id (null when the sheet's name didn't match one: reported, never saved). */
  track: string | null;
  trackName: string;
  rank: number;
  name: string;
  timeText: string;
  timeMs: number;
}

export interface ParsedSheet {
  entries: SheetEntry[];
  /** Section labels we didn't know (not a country we map): their rows still count, without a country. */
  unknownSections: string[];
  /** Sheet track names with no track of ours. */
  unknownTracks: string[];
}

const cellAt = (row: string[], i: number) => (row[i] ?? "").replace(/\t/g, " ").trim();

/** Every place on a tab: its section, track, place, name and time. */
export function parseSheetCsv(csv: string): ParsedSheet {
  const entries: SheetEntry[] = [];
  const unknownSections = new Set<string>();
  const unknownTracks = new Set<string>();
  let section = "world";
  let tracks: string[] = [];
  for (const row of parseCsv(csv)) {
    const filled = row.map((c, i) => [i, c.trim()] as const).filter(([, c]) => c);
    if (!filled.length) continue;
    // A label row: one cell on its own, not a number (a country's section starts).
    if (filled.length === 1 && !/^\d/.test(filled[0][1])) {
      const label = filled[0][1];
      if (/^\d+cc/i.test(label)) continue; // the tab's own title ("150cc", "150cc Inward")
      const code = SHEET_COUNTRIES[label.toLowerCase()];
      if (code) section = code;
      else { section = `?${label}`; unknownSections.add(label); }
      tracks = [];
      continue;
    }
    // A track row: track names where the places go.
    const first = cellAt(row, 1);
    if (first && !/^\d+$/.test(first)) {
      tracks = [0, 1, 2, 3].map((k) => cellAt(row, 1 + 5 * k));
      continue;
    }
    for (let k = 0; k < 4; k++) {
      const trackName = tracks[k];
      if (!trackName) continue;
      const rank = Number(cellAt(row, 1 + 5 * k));
      const name = cellAt(row, 3 + 5 * k);
      const timeText = cellAt(row, 4 + 5 * k);
      if (!Number.isInteger(rank) || rank < 1 || !name || !timeText) continue;
      const timeMs = parseTime(timeText);
      if (timeMs == null) continue;
      const track = sheetTrackId(trackName);
      if (!track) unknownTracks.add(trackName);
      entries.push({ section, track, trackName, rank, name, timeText, timeMs });
    }
  }
  return { entries, unknownSections: [...unknownSections], unknownTracks: [...unknownTracks] };
}

// ── Proof links (only on the published page; the CSV has none) ────────────────

/** A link to a clip or a post that shows the run, never to a spreadsheet, document or drive (Britton, 2026-11-05). */
export function isProofLink(href: string): boolean {
  let host = "";
  try { host = new URL(href).hostname.toLowerCase(); } catch { return false; }
  return !/(^|\.)(docs|sheets|drive)\.google\.com$|(^|\.)googleusercontent\.com$|(^|\.)(dropbox|onedrive\.live|1drv)\.com$/.test(host);
}

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/** The links on a tab's published page, by the time they're on ("1:33.717" → its links). */
export function sheetLinks(html: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const re = /<a\b[^>]*\bhref="([^"]+)"[^>]*>([^<]{4,12})<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const text = decode(m[2]).trim();
    if (parseTime(text) == null) continue;
    let href = decode(m[1]);
    try {
      const u = new URL(href);
      if (u.hostname.endsWith("google.com") && u.pathname === "/url") href = u.searchParams.get("q") ?? "";
    } catch { continue; }
    if (!/^https:\/\//.test(href) || href.length > 500 || !isProofLink(href)) continue;
    const list = out.get(text) ?? [];
    if (!list.includes(href)) list.push(href);
    out.set(text, list);
  }
  return out;
}

// ── One player's best per track, and their country ───────────────────────────

export interface SheetTime { track: string; key: string; name: string; timeMs: number; timeText: string; link: string | null }

/**
 * A tab's times: each player's best on each track (a player can be in the world section and their country's), with
 * a proof link when the page links that time and no one else on the tab has the same time.
 */
export function sheetTimes(parsed: ParsedSheet, links: Map<string, string[]> = new Map()): SheetTime[] {
  const best = new Map<string, SheetTime>();
  for (const e of parsed.entries) {
    if (!e.track) continue;
    const key = sheetNameKey(e.name);
    const k = `${e.track}|${key}`;
    const had = best.get(k);
    if (!had || e.timeMs < had.timeMs) best.set(k, { track: e.track, key, name: sheetDisplayName(e.name), timeMs: e.timeMs, timeText: e.timeText, link: null });
  }
  const list = [...best.values()];
  const byText = new Map<string, number>();
  for (const t of list) byText.set(t.timeText, (byText.get(t.timeText) ?? 0) + 1);
  for (const t of list) {
    const l = links.get(t.timeText);
    if (l?.length === 1 && byText.get(t.timeText) === 1) t.link = l[0];
  }
  return list;
}

/**
 * Each player's country from the country sections, across every tab read: a player in one country's sections gets
 * it; a player listed under two countries gets none (the sheets list a few people twice).
 */
export function sheetCountries(parsed: ParsedSheet[]): Map<string, string | null> {
  const seen = new Map<string, Set<string>>();
  for (const p of parsed) for (const e of p.entries) {
    if (e.section === "world" || e.section.startsWith("?")) continue;
    const key = sheetNameKey(e.name);
    const set = seen.get(key) ?? new Set<string>();
    set.add(e.section);
    seen.set(key, set);
  }
  return new Map([...seen].map(([k, set]) => [k, set.size === 1 ? [...set][0] : null]));
}
