/**
 * A lounge's history, worked out for a ladder (history import picks 2026-11-01, https://claude.ai/artifact/8DkgY7VZgHqRH1HkiQf9Un,
 * all 13 as recommended). Pure, client-safe: the Platform import screen builds the plan in the browser from the files
 * (importRead.ts), shows its checks, and sends it to the server in pieces.
 *
 *   - Every table and change comes in as recorded, never worked out again (pick 4A). Tables are numbered in date order.
 *   - Teams aren't stored by the bot, but teammates always share one change, so a tied place sorts out by the change
 *     (392 of 453 ties across Seasons 5 to 7); the rest group by place and say so.
 *   - Wherever a player's next table started from a different number than their last ended (strikes, staff fixes), and
 *     where they finished a season away from their last table, a Penalty or Bonus line makes the numbers add up (5A).
 *   - Players are matched by Discord id (6A). The newest name shows, earlier ones are kept; where two players used the
 *     same name in different seasons, whoever played most recently keeps it and the other gets a number added.
 *   - A formula check per season: how many recorded changes the 200 Lounge rules give back (lounge200.ts).
 */

import { lounge200Deltas } from "./lounge200";
import type { SeasonSource, SourceResult, SourceTable } from "./importRead";
import { nameKey, parseRace, roomPlaces } from "./rules";
import { FORMATS } from "./types";

export interface PlanPlayer { ref: string; name: string; key: string; discordId: string | null; country: string | null; earlierNames: string[]; existingId?: string | null }
export interface PlanResult { p: number; team: number; place: number; score: number | null; before: number; delta: number; after: number }
export interface PlanTable { season: number; ref: string; at: string; format: number; tier: string | null; body: string; teamsKnown: boolean; results: PlanResult[] }
export interface PlanAdjustment { season: number; p: number; at: string; before: number; delta: number; after: number; kind: "penalty" | "bonus" }
export interface PlanRating { season: number; p: number; mmr: number; peak: number; events: number; wins: number; last: string }
export interface PlanSeason {
  season: number; file: string; from: string; to: string; tables: number; players: number; results: number;
  check: { checked: number; matched: number; maxOff: number };
}
export interface PlanCounts {
  tables: number; results: number; players: number;
  teamsFromPlaces: number; tiesSorted: number; teamsUnclear: number;
  gaps: number; seasonEnds: number; nameClashes: number; bodiesOff: number;
  skippedTables: number; skippedResults: number; newPlayers: number; matchedPlayers: number;
}
export interface ImportPlan {
  seasons: PlanSeason[];
  divisions: { name: string; at: number }[];
  /** "lounge200" when the files are the 200cc Lounge bot's export (its rules carry over, pick 1A). */
  rules: "lounge200" | null;
  players: PlanPlayer[];
  tables: PlanTable[];
  adjustments: PlanAdjustment[];
  ratings: PlanRating[];
  counts: PlanCounts;
  problems: string[];
}

/** A ladder's own players, so the import can match them (Discord id) or keep clear of their names. */
export interface ExistingPlayer { id: string; name: string; key: string; discordId: string | null }

const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"}`;
const byTime = (a: { at: string; ref: string }, b: { at: string; ref: string }) => (a.at < b.at ? -1 : a.at > b.at ? 1 : Number(a.ref) - Number(b.ref) || a.ref.localeCompare(b.ref));
const isoPlus = (iso: string, ms: number) => new Date(Date.parse(iso) + ms).toISOString();

export function planImport(sources: SeasonSource[], existing: ExistingPlayer[] = []): ImportPlan {
  const problems: string[] = [];
  const seasonsSeen = new Set<number>();
  const list = sources.filter((s) => {
    if (s.season == null || !Number.isInteger(s.season) || s.season < 1 || s.season > 999) { problems.push(`${s.file}: which season is this? Give it a number.`); return false; }
    if (seasonsSeen.has(s.season)) { problems.push(`Season ${s.season} is in two files.`); return false; }
    seasonsSeen.add(s.season);
    return true;
  }).sort((a, b) => a.season! - b.season!);

  // ── Players ──
  type Acc = { ref: string; names: { season: number; name: string }[]; country: string | null; lastAt: string; discord: boolean };
  const acc = new Map<string, Acc>();
  let skippedResults = 0;
  let skippedTables = 0;
  const perSeason = list.map((s) => {
    const tableById = new Map(s.tables.filter((t) => FORMATS.includes(t.format as 1)).map((t) => [t.id, t]));
    const playerById = new Map(s.players.map((p) => [p.id, p]));
    const results = s.results.filter((r) => {
      if (!tableById.has(r.table) || !r.player) { skippedResults++; return false; }
      return true;
    });
    const byTable = new Map<string, SourceResult[]>();
    for (const r of results) byTable.set(r.table, [...(byTable.get(r.table) ?? []), r]);
    skippedTables += s.tables.length - byTable.size;
    for (const r of results) {
      const src = playerById.get(r.player);
      const a = acc.get(r.player) ?? { ref: r.player, names: [], country: null, lastAt: "", discord: s.keyedBy === "discord" && /^\d{5,25}$/.test(r.player) };
      const t = tableById.get(r.table)!;
      const name = (src?.name || (s.keyedBy === "name" ? r.player : "")).trim().slice(0, 32);
      if (name && !a.names.some((n) => n.season === s.season && n.name === name)) a.names.push({ season: s.season!, name });
      if (src?.country) a.country = src.country;
      if (t.at > a.lastAt) a.lastAt = t.at;
      acc.set(r.player, a);
    }
    return { s, tableById, playerById, byTable };
  });

  // Newest name per player, then clashes: an existing ladder name stays; then whoever played most recently.
  const existingByDiscord = new Map(existing.filter((e) => e.discordId).map((e) => [e.discordId!, e]));
  const taken = new Map(existing.map((e) => [e.key, e.discordId ?? `existing:${e.id}`]));
  const accs = [...acc.values()].sort((a, b) => (a.lastAt < b.lastAt ? 1 : a.lastAt > b.lastAt ? -1 : a.ref.localeCompare(b.ref)));
  let nameClashes = 0;
  const players: PlanPlayer[] = [];
  for (const a of accs) {
    const ordered = [...a.names].sort((x, y) => y.season - x.season);
    const discordId = a.discord ? a.ref : null;
    const mine = discordId ? existingByDiscord.get(discordId) : undefined;
    let name = mine?.name ?? ordered[0]?.name ?? `Player ${a.ref.slice(-4)}`;
    let key = nameKey(name);
    if (!mine) {
      const owner = taken.get(key);
      if (owner != null && owner !== discordId) {
        nameClashes++;
        for (let n = 2; ; n++) {
          const cand = `${name.slice(0, 27)} (${n})`;
          if (!taken.has(nameKey(cand))) { name = cand; key = nameKey(cand); break; }
        }
      }
    }
    taken.set(key, discordId ?? `ref:${a.ref}`);
    const earlier = [...new Set(ordered.map((n) => n.name).filter((n) => nameKey(n) !== nameKey(name)))].slice(0, 10);
    players.push({ ref: a.ref, name, key, discordId, country: a.country, earlierNames: earlier, existingId: mine?.id ?? null });
  }
  const pIndex = new Map(players.map((p, i) => [p.ref, i]));

  // ── Tables, adjustments, ratings, checks ──
  const tables: PlanTable[] = [];
  const adjustments: PlanAdjustment[] = [];
  const ratings: PlanRating[] = [];
  const seasons: PlanSeason[] = [];
  let teamsFromPlaces = 0, tiesSorted = 0, teamsUnclear = 0, gaps = 0, seasonEnds = 0, bodiesOff = 0;

  for (const { s, tableById, playerById, byTable } of perSeason) {
    const season = s.season!;
    const ordered = [...byTable.keys()].map((id) => tableById.get(id)!).map((t) => ({ ...t, ref: t.id })).sort(byTime);
    const lastAfter = new Map<string, number>();
    const stats = new Map<string, { mmr: number; peak: number; events: number; wins: number; last: string }>();
    const firstTable = new Map<string, string>();
    let checked = 0, matched = 0, maxOff = 0;

    for (const t of ordered) {
      const rs = byTable.get(t.id)!;
      const { teams, known, how } = teamsOf(t, rs);
      if (how === "places") teamsFromPlaces++; else if (how === "change") tiesSorted++; else teamsUnclear++;
      const body = bodyOf(t, teams, (ref) => players[pIndex.get(ref)!]);
      const room = parseRace(body, t.format);
      const places = new Map(roomPlaces(room).map((x) => [x.player.key, x.place]));
      const want = teams.flatMap((tm) => tm.map((r) => players[pIndex.get(r.player)!].key)).sort().join("|");
      const got = room.teams.flatMap((tm) => tm.players.map((p) => p.key)).sort().join("|");
      if (want !== got) bodiesOff++;
      const results: PlanResult[] = [];
      teams.forEach((tm, team) => {
        for (const r of tm) {
          const p = pIndex.get(r.player)!;
          const key = players[p].key;
          // A gap since this player's last table: a penalty or a bonus between the two.
          const prev = lastAfter.get(r.player);
          if (prev != null && prev !== r.before) {
            gaps++;
            adjustments.push({ season, p, at: isoPlus(t.at, -1000), before: prev, delta: r.before - prev, after: r.before, kind: r.before < prev ? "penalty" : "bonus" });
          }
          if (!firstTable.has(r.player)) firstTable.set(r.player, t.id);
          lastAfter.set(r.player, r.after);
          results.push({ p, team, place: places.get(key) ?? r.place, score: r.score, before: r.before, delta: r.delta, after: r.after });
          const st = stats.get(r.player) ?? { mmr: r.before, peak: Math.max(1, r.before), events: 0, wins: 0, last: t.at };
          st.events++; if (r.delta > 0) st.wins++;
          st.mmr = r.after; st.peak = Math.max(st.peak, r.before, r.after); st.last = t.at;
          stats.set(r.player, st);
        }
      });
      tables.push({ season, ref: t.id, at: t.at, format: t.format, tier: t.tier, body, teamsKnown: known, results });

      // The formula check: known teams, nobody on their first table this season, not edited by staff afterwards
      // (marked, or teammates no longer sharing one change: staff changed one player's number by hand).
      const shared = teams.every((tm) => tm.every((r) => r.delta === tm[0].delta || r.before + tm[0].delta <= 0));
      if (known && shared && !s.edited.has(t.id) && !rs.some((r) => firstTable.get(r.player) === t.id)) {
        const rated = teams.map((tm) => ({ rating: tm.reduce((a, r) => a + r.before, 0) / tm.length, rank: tm[0].place }));
        const deltas = lounge200Deltas(rated, t.format);
        teams.forEach((tm, i) => {
          for (const r of tm) {
            const d = r.before + deltas[i] <= 0 ? -r.before : deltas[i];
            checked++;
            if (d === r.delta) matched++; else maxOff = Math.max(maxOff, Math.abs(d - r.delta));
          }
        });
      }
    }

    // Where each player finished the season, if the file says and it's not where their last table left them.
    const lastAt = ordered.length ? ordered[ordered.length - 1].at : "";
    for (const [ref, st] of stats) {
      const final = playerById.get(ref)?.mmr;
      if (final != null && final !== st.mmr) {
        seasonEnds++;
        adjustments.push({ season, p: pIndex.get(ref)!, at: isoPlus(st.last, 60_000), before: st.mmr, delta: final - st.mmr, after: final, kind: final < st.mmr ? "penalty" : "bonus" });
        st.mmr = final;
      }
      st.peak = Math.max(st.peak, st.mmr);
      ratings.push({ season, p: pIndex.get(ref)!, mmr: Math.max(1, st.mmr), peak: Math.max(1, st.peak), events: st.events, wins: st.wins, last: st.last });
    }
    seasons.push({
      season, file: s.file, from: ordered[0]?.at ?? "", to: lastAt, tables: ordered.length, players: stats.size,
      results: ordered.reduce((n, t) => n + byTable.get(t.id)!.length, 0), check: { checked, matched, maxOff },
    });
  }

  const divisions = [...list].reverse().find((s) => s.divisions.length)?.divisions ?? [];
  const bot = list.length > 0 && list.every((s) => s.keyedBy === "discord" && s.divisions.length > 0);
  return {
    seasons, divisions, rules: bot ? "lounge200" : null, players, tables, adjustments, ratings, problems,
    counts: {
      tables: tables.length, results: tables.reduce((n, t) => n + t.results.length, 0), players: players.length,
      teamsFromPlaces, tiesSorted, teamsUnclear, gaps, seasonEnds, nameClashes, bodiesOff, skippedTables, skippedResults,
      newPlayers: players.filter((p) => !p.existingId).length, matchedPlayers: players.filter((p) => p.existingId).length,
    },
  };
}

/**
 * A table's teams, best first. FFA: everyone alone. Teams: by place, and inside a tied place by the shared change
 * (teammates always share one); when that still doesn't make teams of the right size, by place alone.
 */
function teamsOf(t: SourceTable, rs: SourceResult[]): { teams: SourceResult[][]; known: boolean; how: "places" | "change" | "unclear" } {
  const order = (a: SourceResult[], b: SourceResult[]) => a[0].place - b[0].place || sum(b) - sum(a);
  if (t.format === 1) return { teams: rs.map((r) => [r]).sort(order), known: true, how: "places" };
  const group = (key: (r: SourceResult) => string) => {
    const m = new Map<string, SourceResult[]>();
    for (const r of rs) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
    return [...m.values()];
  };
  const byPlace = group((r) => String(r.place));
  if (byPlace.every((g) => g.length === t.format)) return { teams: byPlace.sort(order), known: true, how: "places" };
  const byChange = group((r) => `${r.place}:${r.delta}`);
  if (byChange.every((g) => g.length === t.format)) return { teams: byChange.sort(order), known: true, how: "change" };
  return { teams: byPlace.sort(order), known: false, how: "unclear" };
}
const sum = (tm: SourceResult[]) => tm.reduce((a, r) => a + (r.score ?? 0), 0);

/** Lorenzi's text for a table, with each player's ladder name, so the table page reads it like any other. */
function bodyOf(t: SourceTable, teams: SourceResult[][], player: (ref: string) => PlanPlayer): string {
  const line = (r: SourceResult) => { const p = player(r.player); return `${p.name}${p.country ? ` [${p.country}]` : ""} ${r.score ?? 0}`; };
  const out = [`#source ${t.id}`];
  if (t.format === 1) out.push(...teams.map((tm) => line(tm[0])));
  else for (const tm of teams) {
    const tied = teams.filter((x) => x[0].place === tm[0].place).length > 1;
    out.push(`${ordinal(tm[0].place)}${tm.length !== t.format ? " (tied)" : tied ? " (tie)" : ""}`);
    out.push(...tm.map(line));
  }
  return out.join("\n").slice(0, 4000);
}
