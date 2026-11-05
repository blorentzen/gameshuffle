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
import { isCountryCode, noteCountry } from "./countries";
import {
  parseSheetCsv, sheetCountries, sheetCsvUrl, sheetTimes, TT_SHEETS,
  type ParsedSheet, type SheetId, type SheetTime, type TtSheet,
} from "./sheets";
import type { TtClass } from "./tracks";

const CLASSES: TtClass[] = [150, 200];
const CHUNK = 500;

export interface SheetReadReport { sheet: SheetId; cc: TtClass; rows: number; added: number; corrected: number; skipped: number; error: string | null }
export interface SheetSyncReport { ok: boolean; reads: SheetReadReport[]; players: number; newPlayers: number; countries: number;
  /** Countries found on MKCentral by exact name for players the country tables leave out. */
  fromMkc?: number }

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A tab's published CSV. Google sometimes takes 20 to 30 seconds to make one (seen 2026-11-05, from Vercel and from
 * here), so each request gets a long timeout and one more try, and the tabs are fetched side by side.
 */
async function fetchText(url: string): Promise<{ text: string | null; why: string }> {
  let why = "no answer";
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await wait(3000);
    try {
      const res = await fetch(url, { headers: { "user-agent": "GameShuffle time trials (gameshuffle.co)" }, signal: AbortSignal.timeout(75_000), cache: "no-store", redirect: "follow" });
      if (res.ok) return { text: await res.text(), why: "" };
      why = `HTTP ${res.status}`;
    } catch (e) {
      why = (e as Error).name === "TimeoutError" ? "timed out" : (e as Error).message.slice(0, 80) || "network error";
    }
  }
  return { text: null, why };
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
    const got = await fetchText(sheetCsvUrl(sheet, cc));
    const csv = got.text;
    if (!csv) return { sheet, cc, parsed: null, times: [], error: `The sheet didn't answer (${got.why}).` };
    const parsed = parseSheetCsv(csv);
    if (parsed.entries.length < 100) return { sheet, cc, parsed: null, times: [], error: `Only ${parsed.entries.length} places read: the layout may have changed.` };
    const problems = [
      parsed.unknownTracks.length ? `Tracks we don't know: ${parsed.unknownTracks.join(", ")}` : null,
      parsed.unknownSections.length ? `Sections we don't know: ${parsed.unknownSections.join(", ")}` : null,
    ].filter(Boolean).join(". ");
    // Times only: legacy times never link out (Britton, 2026-11-05), so the sheets' own pages aren't read.
    return { sheet, cc, parsed, times: sheetTimes(parsed), error: problems || null };
  };
  const reads: Read[] = [];
  reads.push(...(await Promise.all(sheets.flatMap((sheet) => CLASSES.map((cc) => readTab(sheet, cc))))));
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
  // Players the country tables leave out: MKCentral's registry by exact name. Only after a full read, so the tables
  // always come first (they agreed with MKCentral 93% of the time on 2026-11-05; Lounge names only 67%, so not Lounge).
  const fromMkc = full ? await fillFromMkcNames(ids, owners) : 0;
  log("mkcentral countries");
  return { ok: out.every((r) => !r.error || r.rows > 0), reads: out, players: ids.size, newPlayers: made, countries, fromMkc };
}

const norm = (s: string) => s.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();

/** The country MKCentral's registry has for exactly one visible player of this name, or null. */
export async function mkcentralCountryByName(name: string): Promise<string | null> {
  const res = await fetch(`https://mkcentral.com/api/registry/players?name=${encodeURIComponent(name.slice(0, 40))}`, {
    headers: { accept: "application/json", "user-agent": "GameShuffle time trials (gameshuffle.co)" }, signal: AbortSignal.timeout(10_000), cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) return null;
  const j = (await res.json().catch(() => null)) as { player_list?: { name: string; country_code: string | null; is_hidden?: number; is_banned?: number }[] } | null;
  const exact = (j?.player_list ?? []).filter((p) => norm(p.name) === norm(name) && !p.is_hidden && !p.is_banned);
  const c = exact.length === 1 ? exact[0].country_code?.toLowerCase() ?? null : null;
  return c && isCountryCode(c) ? c : null;
}

/** Listed players with no country: a few MKCentral lookups a run (random order, so each run reaches different names). */
async function fillFromMkcNames(ids: Map<string, string>, owners: Map<string, string>, lookups = 60): Promise<number> {
  const db = createServiceClient();
  const listed = [...ids.entries()].filter(([, id]) => !owners.has(id)).map(([key, id]) => ({ key, id, player: `i:${id}` }));
  const have = new Set<string>();
  for (const part of chunks(listed.map((l) => l.player), 200)) {
    const { data } = await db.from("tt_player_country").select("player").in("player", part);
    for (const r of (data ?? []) as { player: string }[]) have.add(r.player);
  }
  const missing = listed.filter((l) => !have.has(l.player)).sort(() => Math.random() - 0.5).slice(0, lookups);
  if (!missing.length) return 0;
  const { data: named } = await db.from("gs_identities").select("id, display_name").in("id", missing.map((m) => m.id));
  const nameOf = new Map(((named ?? []) as { id: string; display_name: string | null }[]).map((r) => [r.id, r.display_name ?? ""]));
  let filled = 0;
  for (const m of missing) {
    const c = await mkcentralCountryByName(nameOf.get(m.id) || m.key);
    if (c) { await noteCountry(m.player, c, "mkcentral"); filled++; }
    await wait(150);
  }
  return filled;
}

export interface SheetStatus { sheet: SheetId; cc: TtClass; readAt: string; rows: number; added: number; error: string | null }

/** When each tab was last read (for staff). */
export async function sheetStatus(): Promise<SheetStatus[]> {
  if (!(await round4Ready())) return [];
  const { data } = await createServiceClient().from("tt_sheet_reads").select("sheet, cc, read_at, rows, added, error");
  return ((data ?? []) as { sheet: SheetId; cc: number; read_at: string; rows: number; added: number; error: string | null }[])
    .map((r) => ({ sheet: r.sheet, cc: Number(r.cc) as TtClass, readAt: r.read_at, rows: r.rows, added: r.added, error: r.error }));
}
