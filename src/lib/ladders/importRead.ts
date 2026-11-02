/**
 * Reading a lounge's records for a history import (history import picks 2026-11-01, pick 11A). Pure, client-safe: the
 * Platform import screen reads files in the browser, so nothing large is uploaded.
 *
 * Two kinds of file:
 *   - The 200cc Lounge bot's MySQL export (billypom/200-Bot, sql/s7200lounge-export.sql and friends). It is read as
 *     text, never run: each table's columns come from its CREATE TABLE (they changed between seasons), and the rows
 *     from its INSERT lines. We keep `player` (Discord id, name, country, MMR), `mogi` (a table: format, tier, day),
 *     `player_mogi` (a result: place, score, MMR before, change, after) and `ranks` (divisions). `tier` maps ids to
 *     names. Friend codes and MKCentral ids are read past and dropped (pick 7A).
 *   - Our CSV template for any other lounge: players.csv, tables.csv, results.csv (headers below).
 *
 * Both become one `SeasonSource` per season.
 */

export interface SourcePlayer { id: string; name: string; country: string | null; mmr: number | null; peak: number | null }
export interface SourceTable { id: string; format: number; tier: string | null; at: string }
export interface SourceResult { table: string; player: string; place: number; score: number | null; before: number; delta: number; after: number }
export interface SeasonSource {
  season: number | null;
  file: string;
  /** Player ids are Discord ids in the bot's export; in a CSV, a Discord id when given, else the name. */
  players: SourcePlayer[];
  tables: SourceTable[];
  results: SourceResult[];
  divisions: { name: string; at: number }[];
  /** Tables staff edited by hand afterwards (the bot's reduced loss): their numbers can't be checked against the formula. */
  edited: Set<string>;
  /** Players keyed by Discord id (the bot) or by name (a CSV without Discord ids). */
  keyedBy: "discord" | "name";
}

// ── MySQL dump ─────────────────────────────────────────────────────────────────────────────────

type Value = string | number | null;

/** Every table's columns and rows in a mysqldump file. */
export function readDump(text: string): Map<string, Record<string, Value>[]> {
  const cols = new Map<string, string[]>();
  const out = new Map<string, Record<string, Value>[]>();
  const create = /CREATE TABLE `(\w+)` \(([\s\S]*?)\n\)/g;
  for (let m = create.exec(text); m; m = create.exec(text)) {
    cols.set(m[1], [...m[2].matchAll(/^\s+`(\w+)`/gm)].map((x) => x[1]));
  }
  const insert = /^INSERT INTO `(\w+)`(?:\s*\(([^)]*)\))? VALUES /gm;
  for (let m = insert.exec(text); m; m = insert.exec(text)) {
    const table = m[1];
    const names = m[2] ? m[2].split(",").map((s) => s.trim().replace(/`/g, "")) : cols.get(table) ?? [];
    const { rows, end } = readTuples(text, m.index + m[0].length);
    const list = out.get(table) ?? [];
    for (const r of rows) {
      const o: Record<string, Value> = {};
      names.forEach((n, i) => { o[n] = r[i] ?? null; });
      list.push(o);
    }
    out.set(table, list);
    insert.lastIndex = end;
  }
  return out;
}

/** The tuples after VALUES, up to the closing semicolon. Strings are single-quoted with backslash escapes. */
function readTuples(s: string, start: number): { rows: Value[][]; end: number } {
  const rows: Value[][] = [];
  let i = start;
  let row: Value[] | null = null;
  let field = "";
  let quoted = false;
  let had = false;
  const ESC: Record<string, string> = { n: "\n", r: "\r", t: "\t", "0": "\0", b: "\b", Z: "\x1a" };
  const push = () => {
    if (!row) return;
    if (quoted) row.push(field);
    else {
      const raw = field.trim();
      // Whole numbers past 15 digits (Discord ids are 17 to 20) stay text: a JavaScript number would round them.
      row.push(!had || raw.toUpperCase() === "NULL" ? null : /^-?\d{1,15}(\.\d+)?$/.test(raw) ? Number(raw) : raw);
    }
    field = ""; quoted = false; had = false;
  };
  while (i < s.length) {
    const c = s[i];
    if (row && c === "'") {
      quoted = true; had = true; i++;
      while (i < s.length) {
        const d = s[i];
        if (d === "\\") { field += ESC[s[i + 1]] ?? s[i + 1]; i += 2; continue; }
        if (d === "'") { if (s[i + 1] === "'") { field += "'"; i += 2; continue; } i++; break; }
        field += d; i++;
      }
      continue;
    }
    if (c === "(" && !row) { row = []; i++; continue; }
    if (row && c === ",") { push(); i++; continue; }
    if (row && c === ")") { push(); rows.push(row); row = null; i++; continue; }
    if (!row && c === ";") return { rows, end: i + 1 };
    if (row) { field += c; if (c.trim()) had = true; }
    i++;
  }
  return { rows, end: i };
}

const str = (v: Value) => (v == null ? "" : String(v));
const numOr = (v: Value, d: number | null) => {
  if (v == null || v === "") return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

/** The season a file's name says ("s7200lounge-export.sql" → 7, the bot's own naming; "season-12.sql" → 12), or null. */
export function seasonFromName(file: string): number | null {
  const bot = /(?:^|[^a-z])s(\d{1,2})200lounge/i.exec(file);
  if (bot) return Number(bot[1]);
  const m = /(?:^|[^a-z])s(?:eason)?[\s_-]?(\d{1,3})(?=\D|$)/i.exec(file);
  return m ? Number(m[1]) : null;
}

/** MySQL's "2025-09-28 16:25:17" (the bot's server, read as UTC) as ISO. */
function isoOf(v: Value): string {
  const s = str(v).trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return new Date(`${s.replace(" ", "T")}Z`).toISOString();
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : "";
}

/** Is this text the 200cc Lounge bot's export? */
export const isLoungeBotDump = (text: string) => /CREATE TABLE `player_mogi`/.test(text) && /CREATE TABLE `mogi`/.test(text);

/** One season from the 200cc Lounge bot's export. */
export function readLoungeBotDump(text: string, file: string): SeasonSource {
  const t = readDump(text);
  const tierName = new Map((t.get("tier") ?? []).map((r) => [str(r.tier_id), str(r.tier_name).replace(/^tier[\s-]*/i, "").toUpperCase() || null]));
  const mogis = t.get("mogi") ?? [];
  const seasonCol = mogis.find((m) => m.season != null)?.season;
  const tables: SourceTable[] = mogis.map((m) => ({
    id: str(m.mogi_id), format: numOr(m.mogi_format, 0) ?? 0, tier: tierName.get(str(m.tier_id)) ?? null, at: isoOf(m.create_date),
  }));
  const edited = new Set(mogis.filter((m) => Number(m.has_reduced_loss) === 1).map((m) => str(m.mogi_id)));
  const players: SourcePlayer[] = (t.get("player") ?? []).map((p) => ({
    id: str(p.player_id), name: str(p.player_name).trim(), country: /^[a-z]{2}$/i.test(str(p.country_code)) ? str(p.country_code).toLowerCase() : null,
    mmr: numOr(p.mmr, null), peak: numOr(p.peak_mmr, null),
  }));
  const results: SourceResult[] = (t.get("player_mogi") ?? []).map((r) => ({
    table: str(r.mogi_id), player: str(r.player_id), place: numOr(r.place, 0) ?? 0, score: numOr(r.score, null),
    before: numOr(r.prev_mmr, 0) ?? 0, delta: numOr(r.mmr_change, 0) ?? 0, after: numOr(r.new_mmr, 0) ?? 0,
  }));
  const divisions = (t.get("ranks") ?? [])
    .map((r) => ({ name: str(r.rank_name).trim(), at: numOr(r.mmr_min, -1) ?? -1 }))
    .filter((d) => d.name && d.at >= 0 && d.name.toLowerCase() !== "placement")
    .sort((a, b) => a.at - b.at);
  return {
    season: seasonCol != null ? Number(seasonCol) : seasonFromName(file), file, players, tables, results, divisions, edited, keyedBy: "discord",
  };
}

// ── CSV template ───────────────────────────────────────────────────────────────────────────────

/** The template's headers (public/templates/ladder-import/*.csv). */
export const CSV_HEADERS = {
  players: ["discord_id", "name", "country", "final_mmr"],
  tables: ["season", "table", "date", "format", "tier"],
  results: ["season", "table", "player", "place", "score", "mmr_before", "change", "mmr_after"],
} as const;

/** RFC 4180-ish: commas, double quotes, CRLF or LF. */
export function readCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim())) rows.push(row);
  const head = (rows.shift() ?? []).map((h) => h.trim().toLowerCase().replace(/^﻿/, ""));
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? "").trim()])));
}

/** Seasons from the three template files. A result's `player` is a Discord id or a name (whichever players.csv keys by). */
export function readTemplate(files: { players: string; tables: string; results: string }, names: { players: string; tables: string; results: string }): SeasonSource[] {
  const players = readCsv(files.players);
  const tables = readCsv(files.tables);
  const results = readCsv(files.results);
  const byDiscord = players.some((p) => /^\d{5,25}$/.test(p.discord_id ?? ""));
  const key = (p: Record<string, string>) => (byDiscord && /^\d{5,25}$/.test(p.discord_id ?? "") ? p.discord_id : (p.name ?? "").trim());
  const playerList: SourcePlayer[] = players.filter((p) => (p.name ?? "").trim()).map((p) => ({
    id: key(p), name: p.name.trim(), country: /^[a-z]{2}$/i.test(p.country ?? "") ? p.country.toLowerCase() : null, mmr: p.final_mmr ? Number(p.final_mmr) || null : null, peak: null,
  }));
  // A results row may name a player by name even when players.csv has Discord ids.
  const nameToId = new Map(playerList.map((p) => [p.name.toLowerCase(), p.id]));
  const seasons = [...new Set(tables.map((t) => Number(t.season)).filter((n) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b);
  return seasons.map((season) => ({
    season, file: `${names.tables} (Season ${season})`, keyedBy: byDiscord ? "discord" : "name", edited: new Set<string>(), divisions: [],
    players: playerList,
    tables: tables.filter((t) => Number(t.season) === season).map((t) => ({
      id: t.table, format: Number(t.format.replace(/v\d+$/i, "").replace(/ffa/i, "1")) || 1, tier: t.tier || null, at: isoOf(t.date),
    })),
    results: results.filter((r) => Number(r.season) === season).map((r) => ({
      table: r.table, player: nameToId.get((r.player ?? "").toLowerCase()) ?? r.player, place: Number(r.place) || 0,
      score: r.score === "" ? null : Number(r.score), before: Number(r.mmr_before) || 0, delta: Number(r.change) || 0, after: Number(r.mmr_after) || 0,
    })),
  }));
}
