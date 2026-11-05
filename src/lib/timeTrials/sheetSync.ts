import "server-only";

/**
 * The daily read of the community's Top 10 sheets (picks 2026-11-04, SGSXW3sBrn6GJSinYimSnc, all as recommended;
 * time-trials-m5.sql). Each name on a sheet is a listed player (gs_identities, platform 'sheet'); their times come in
 * with source 'sheet'. tt_sheet_rows remembers what each tab said last, so a time is added only when it changes:
 * a faster time joins the player's history, a slower one means the sheet corrected itself and the old time is taken
 * down. A listed player someone claimed (tt_claims approved) gets their sheet times on the account instead. Countries
 * come from the country sections (a player under two countries gets none) and never replace one the player picked.
 * Times faster than the record floor are skipped, as everywhere else.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { readAllPages } from "@/lib/supabase/pages";
import { round4Ready } from "./status";
import { fasterThanRecord } from "./records";
import {
  parseSheetCsv, sheetCountries, sheetCsvUrl, sheetHtmlUrl, sheetLinks, sheetTimes, TT_SHEETS,
  type ParsedSheet, type SheetId, type SheetTime, type TtSheet,
} from "./sheets";
import type { TtClass } from "./tracks";

const CLASSES: TtClass[] = [150, 200];
const CHUNK = 500;

export interface SheetReadReport { sheet: SheetId; cc: TtClass; rows: number; added: number; corrected: number; skipped: number; error: string | null }
export interface SheetSyncReport { ok: boolean; reads: SheetReadReport[]; players: number; newPlayers: number; countries: number }

/** A published sheet page, tried twice. Google turns away many requests at once, so the read goes one tab at a time. */
async function fetchText(url: string): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, { headers: { "user-agent": "GameShuffle time trials (gameshuffle.co)" }, signal: AbortSignal.timeout(20_000), cache: "no-store" }).catch(() => null);
    if (res?.ok) return res.text();
    if (attempt === 0) await new Promise((r) => setTimeout(r, 1500));
  }
  return null;
}

const chunks = <T,>(list: T[], n = CHUNK): T[][] => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

/** The listed player for each sheet name, made the first time a name shows up. */
async function identitiesFor(names: Map<string, string>): Promise<{ ids: Map<string, string>; made: number }> {
  const db = createServiceClient();
  const keys = [...names.keys()];
  const ids = new Map<string, string>();
  const read = async (list: string[]) => {
    for (const part of chunks(list, 150)) {
      const { data, error } = await db.from("gs_identities").select("id, platform_id").eq("platform", "sheet").in("platform_id", part);
      if (error) throw new Error(`identities: ${error.message}`);
      for (const r of (data ?? []) as { id: string; platform_id: string }[]) ids.set(r.platform_id, r.id);
    }
  };
  await read(keys);
  const missing = keys.filter((k) => !ids.has(k));
  for (const part of chunks(missing)) {
    const { error } = await db.from("gs_identities").upsert(part.map((k) => ({ platform: "sheet", platform_id: k, display_name: names.get(k)!, tier: "anon" })), { onConflict: "platform,platform_id", ignoreDuplicates: true });
    if (error) throw new Error(`new identities: ${error.message}`);
  }
  if (missing.length) await read(missing);
  return { ids, made: missing.length };
}

/** Listed players someone claimed: their account. */
async function claimedBy(identityIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const db = createServiceClient();
  for (const part of chunks(identityIds, 200)) {
    const { data } = await db.from("tt_claims").select("identity_id, user_id").eq("status", "approved").in("identity_id", part);
    for (const r of (data ?? []) as { identity_id: string; user_id: string }[]) out.set(r.identity_id, r.user_id);
  }
  return out;
}

type Row = { track: string; identity_id: string; time_ms: number; link: string | null; time_id: string | null };

async function saveRead(sheet: TtSheet, cc: TtClass, times: SheetTime[], ids: Map<string, string>, owners: Map<string, string>): Promise<Omit<SheetReadReport, "sheet" | "cc" | "error">> {
  const db = createServiceClient();
  const { data: had, error } = await readAllPages<Row>((from, to) =>
    db.from("tt_sheet_rows").select("track, identity_id, time_ms, link, time_id").eq("sheet", sheet.id).eq("cc", cc).order("track").order("identity_id").range(from, to));
  if (error) throw new Error(`rows: ${error.message}`);
  const before = new Map(had.map((r) => [`${r.track}|${r.identity_id}`, r]));
  // A claimed player's own times on these boards, so a time they already added isn't added twice.
  const accounts = [...new Set(owners.values())].map((u) => `u:${u}`);
  const own = new Map<string, string>();
  for (const part of chunks(accounts, 100)) {
    const { data } = await db.from("tt_times").select("id, player, track, time_ms").in("player", part).eq("game", "mk8dx").eq("cc", cc).eq("items", "shrooms").eq("vehicle", sheet.vehicle).eq("status", "ok").limit(5000);
    for (const r of (data ?? []) as { id: string; player: string; track: string; time_ms: number }[]) own.set(`${r.player}|${r.track}|${r.time_ms}`, r.id);
  }

  const inserts: Record<string, unknown>[] = [];
  const rowsOut: Record<string, unknown>[] = [];
  const takeDown: string[] = [];
  const linkUpdates: { timeId: string; link: string | null }[] = [];
  let skipped = 0;
  const now = new Date().toISOString();
  for (const t of times) {
    const identity = ids.get(t.key);
    if (!identity) continue;
    const prev = before.get(`${t.track}|${identity}`);
    if (prev && prev.time_ms === t.timeMs) {
      if ((prev.link ?? null) !== t.link) {
        rowsOut.push({ sheet: sheet.id, cc, track: t.track, identity_id: identity, time_ms: t.timeMs, link: t.link, time_id: prev.time_id, seen_at: now });
        if (prev.time_id) linkUpdates.push({ timeId: prev.time_id, link: t.link });
      }
      continue;
    }
    if (fasterThanRecord("mk8dx", t.track, cc, t.timeMs)) { skipped++; continue; }
    const user = owners.get(identity) ?? null;
    const player = user ? `u:${user}` : `i:${identity}`;
    if (prev && prev.time_id && t.timeMs > prev.time_ms) takeDown.push(prev.time_id);
    const dupe = user ? own.get(`${player}|${t.track}|${t.timeMs}`) : undefined;
    if (dupe) {
      rowsOut.push({ sheet: sheet.id, cc, track: t.track, identity_id: identity, time_ms: t.timeMs, link: t.link, time_id: dupe, seen_at: now });
      continue;
    }
    inserts.push({
      player, user_id: user, identity_id: identity, game: "mk8dx", track: t.track, cc, items: "shrooms", vehicle: sheet.vehicle,
      time_ms: t.timeMs, proof_kind: "none", proof_url: null, read_by_ai: false, source: "sheet", sheet: sheet.id, sheet_link: t.link,
    });
  }

  let added = 0;
  for (const part of chunks(inserts)) {
    const { data, error: e } = await db.from("tt_times").insert(part).select("id, identity_id, track, time_ms");
    if (e) throw new Error(`times: ${e.message}`);
    for (const r of (data ?? []) as { id: string; identity_id: string; track: string; time_ms: number }[]) {
      const t = part.find((p) => p.identity_id === r.identity_id && p.track === r.track);
      rowsOut.push({ sheet: sheet.id, cc, track: r.track, identity_id: r.identity_id, time_ms: r.time_ms, link: (t?.sheet_link as string | null) ?? null, time_id: r.id, seen_at: now });
      added++;
    }
  }
  for (const part of chunks(rowsOut)) {
    const { error: e } = await db.from("tt_sheet_rows").upsert(part, { onConflict: "sheet,cc,track,identity_id" });
    if (e) throw new Error(`sheet rows: ${e.message}`);
  }
  for (const part of chunks(takeDown, 200)) {
    await db.from("tt_times").update({ status: "removed", removed_reason: "Changed on the Top 10 sheet", removed_at: now }).in("id", part).eq("source", "sheet").eq("status", "ok");
  }
  for (const u of linkUpdates) await db.from("tt_times").update({ sheet_link: u.link }).eq("id", u.timeId).eq("source", "sheet");
  return { rows: times.length, added, corrected: takeDown.length, skipped };
}

/** Countries from the sheets' country sections, for listed players (and claimed accounts without one). */
async function saveCountries(countries: Map<string, string | null>, ids: Map<string, string>, owners: Map<string, string>): Promise<number> {
  const db = createServiceClient();
  const wanted = new Map<string, string | null>();
  for (const [key, c] of countries) {
    const id = ids.get(key);
    if (!id) continue;
    const user = owners.get(id);
    wanted.set(user ? `u:${user}` : `i:${id}`, c);
  }
  const players = [...wanted.keys()];
  const have = new Map<string, { country: string; source: string }>();
  for (const part of chunks(players, 200)) {
    const { data } = await db.from("tt_player_country").select("player, country, source").in("player", part);
    for (const r of (data ?? []) as { player: string; country: string; source: string }[]) have.set(r.player, r);
  }
  const add: Record<string, unknown>[] = [];
  const clear: string[] = [];
  const now = new Date().toISOString();
  for (const [player, c] of wanted) {
    const h = have.get(player);
    if (h && h.source !== "sheet") continue; // picked, the account's own, lounge or MKCentral: theirs stands
    if (!c) { if (h) clear.push(player); continue; }
    if (!h || h.country !== c) add.push({ player, country: c, source: "sheet", updated_at: now });
  }
  for (const part of chunks(add)) await db.from("tt_player_country").upsert(part, { onConflict: "player" });
  for (const part of chunks(clear, 200)) await db.from("tt_player_country").delete().in("player", part).eq("source", "sheet");
  return add.length;
}

/** Reads every sheet (or `only` some) and saves what changed. */
export async function syncSheets(opts: { only?: SheetId[]; log?: (step: string) => void } = {}): Promise<SheetSyncReport> {
  if (!(await round4Ready())) return { ok: false, reads: [], players: 0, newPlayers: 0, countries: 0 };
  let t0 = Date.now();
  const log = (step: string) => { opts.log?.(`${step} ${((Date.now() - t0) / 1000).toFixed(1)}s`); t0 = Date.now(); };
  const db = createServiceClient();
  const sheets = TT_SHEETS.filter((s) => !opts.only || opts.only.includes(s.id));
  type Read = { sheet: TtSheet; cc: TtClass; parsed: ParsedSheet | null; times: SheetTime[]; error: string | null };
  const readTab = async (sheet: TtSheet, cc: TtClass): Promise<Read> => {
    const csv = await fetchText(sheetCsvUrl(sheet, cc));
    const html = csv ? await fetchText(sheetHtmlUrl(sheet, cc)) : null;
    if (!csv) return { sheet, cc, parsed: null, times: [], error: "The sheet didn't answer." };
    const parsed = parseSheetCsv(csv);
    if (parsed.entries.length < 100) return { sheet, cc, parsed: null, times: [], error: `Only ${parsed.entries.length} places read: the layout may have changed.` };
    const problems = [
      parsed.unknownTracks.length ? `Tracks we don't know: ${parsed.unknownTracks.join(", ")}` : null,
      parsed.unknownSections.length ? `Sections we don't know: ${parsed.unknownSections.join(", ")}` : null,
    ].filter(Boolean).join(". ");
    return { sheet, cc, parsed, times: sheetTimes(parsed, html ? sheetLinks(html) : new Map()), error: problems || null };
  };
  const reads: Read[] = [];
  for (const sheet of sheets) for (const cc of CLASSES) reads.push(await readTab(sheet, cc));
  log("read the sheets");

  const names = new Map<string, string>();
  for (const r of reads) for (const t of r.times) if (!names.has(t.key)) names.set(t.key, t.name);
  const { ids, made } = await identitiesFor(names);
  const owners = await claimedBy([...ids.values()]);
  log("players");

  const out: SheetReadReport[] = [];
  for (const r of reads) {
    let res = { rows: 0, added: 0, corrected: 0, skipped: 0 };
    let error = r.error;
    if (r.parsed) {
      try { res = await saveRead(r.sheet, r.cc, r.times, ids, owners); }
      catch (e) { error = (e as Error).message; }
    }
    out.push({ sheet: r.sheet.id, cc: r.cc, ...res, error });
    log(`saved ${r.sheet.id} ${r.cc}`);
    await db.from("tt_sheet_reads").upsert({ sheet: r.sheet.id, cc: r.cc, read_at: new Date().toISOString(), rows: res.rows, added: res.added, error }, { onConflict: "sheet,cc" });
  }
  // Countries only from a full read: with a tab missing, someone listed under two countries could look like one.
  const full = reads.every((r) => r.parsed) && !opts.only;
  const countries = full ? await saveCountries(sheetCountries(reads.map((r) => r.parsed!)), ids, owners) : 0;
  log("countries");
  return { ok: out.every((r) => !r.error || r.rows > 0), reads: out, players: ids.size, newPlayers: made, countries };
}

export interface SheetStatus { sheet: SheetId; cc: TtClass; readAt: string; rows: number; added: number; error: string | null }

/** When each tab was last read (for staff). */
export async function sheetStatus(): Promise<SheetStatus[]> {
  if (!(await round4Ready())) return [];
  const { data } = await createServiceClient().from("tt_sheet_reads").select("sheet, cc, read_at, rows, added, error");
  return ((data ?? []) as { sheet: SheetId; cc: number; read_at: string; rows: number; added: number; error: string | null }[])
    .map((r) => ({ sheet: r.sheet, cc: Number(r.cc) as TtClass, readAt: r.read_at, rows: r.rows, added: r.added, error: r.error }));
}
