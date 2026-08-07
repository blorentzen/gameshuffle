/**
 * Heat → Mains format (Tournament Overhaul — experimental). A transfer/consi
 * ladder inspired by dirt-track / sprint-car racing, adapted for Mario Kart.
 *
 *   1. The field runs one or two SERIES of heats (each driver races 1–2 heats).
 *      Series 2 re-draws the split so you face fresh opponents.
 *   2. Seeding the mains:
 *        - Win ANY heat → you always make the A Main.
 *        - The A Main only seats `mainSeedSize` (10 for MK8DX); if there are more
 *          heat winners than spots, total heat points break the tie.
 *        - Everyone else is seeded by TOTAL points across every heat they ran,
 *          then chunked into mains of `mainSeedSize` (A, B, C, …).
 *   3. Each main seats 10 of its 12-kart cap, leaving 2 open spots. Mains run
 *      bottom-up; the top `transfer` (2) of each main move UP into the main above.
 *   4. The A Main (8 races) decides the podium; lower mains (4 races each) fill
 *      the placings beneath it.
 *
 * A bad heat is recoverable (points), a heat win is always rewarded (lock), and
 * a strong lower-main run earns a promotion. Pure + game-agnostic — operates on
 * driver ids and finishing order, so the same engine drives the live sandbox and
 * (later) a DB-backed run. Editing any race's order (or DQ'ing a driver) simply
 * re-reports it; everything downstream recomputes.
 */

// MK8DX-flavoured defaults. Kept internal for now (v1 keeps config minimal).
const HEAT_POINTS = [15, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
const DEFAULT_HEAT_SIZE = 4;
const DEFAULT_TRANSFER = 2;
const DEFAULT_MAIN_SEED = 10; // seeded per main, before transfers
const DEFAULT_MAIN_CAP = 12;
const A_MAIN_RACES = 8;
const LOWER_MAIN_RACES = 4;
const HEAT_RACES = 4;

function heatPoints(pos: number): number {
  return HEAT_POINTS[pos] ?? 0;
}

export type HRaceKind = "heat" | "main";

export interface HRace {
  id: string;
  label: string;
  kind: HRaceKind;
  series?: number; // heats: 0-based series index
  tier?: number; // mains: 0 = A, 1 = B, …
  raceCount: number; // flavour: 4 for heats & lower mains, 8 for the A Main
  drivers: string[]; // participants (mains fill bottom-up, incl. transfers up)
  results: string[] | null; // finishing order (DQ'd appended at the back), null until run
  dq: string[]; // disqualified driver ids
}

export interface HeatMainsOptions {
  series?: number; // heat rounds each driver runs (1–2)
  heatSize?: number; // target racers per heat
  transfer?: number; // per-main top-N move up
  mainSeedSize?: number; // seeds per main before transfers
  mainCap?: number;
}

export interface HeatMains {
  kind: "heat_mains";
  field: string[];
  series: number;
  heatCount: number; // heats per series
  transfer: number;
  mainSeedSize: number;
  mainCap: number;
  heats: HRace[]; // series * heatCount
  mains: HRace[]; // tier 0 (A) .. n
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const letter = (i: number) => String.fromCharCode(65 + i);
const deep = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

function mainLabel(tier: number): string {
  return `${letter(tier)} Main`;
}

/** Split a field into `heatCount` heats for series `s`, offsetting the round-
 *  robin so different series produce different groupings (mixes opponents). */
function splitHeats(field: string[], heatCount: number, s: number): string[][] {
  const groups: string[][] = Array.from({ length: heatCount }, () => []);
  field.forEach((id, i) => groups[(i + s) % heatCount].push(id));
  return groups;
}

export function generateHeatMains(field: string[], opts: HeatMainsOptions = {}): HeatMains {
  const heatSize = opts.heatSize ?? DEFAULT_HEAT_SIZE;
  const series = clamp(opts.series ?? (field.length >= 8 ? 2 : 1), 1, 3);
  const heatCount = Math.max(1, Math.round(field.length / heatSize));

  const heats: HRace[] = [];
  for (let s = 0; s < series; s++) {
    const groups = splitHeats(field, heatCount, s);
    for (let h = 0; h < heatCount; h++) {
      heats.push({
        id: `s${s}h${h}`,
        label: series > 1 ? `Series ${s + 1} · Heat ${letter(h)}` : `Heat ${letter(h)}`,
        kind: "heat",
        series: s,
        raceCount: HEAT_RACES,
        drivers: groups[h],
        results: null,
        dq: [],
      });
    }
  }

  const hm: HeatMains = {
    kind: "heat_mains",
    field,
    series,
    heatCount,
    transfer: opts.transfer ?? DEFAULT_TRANSFER,
    mainSeedSize: opts.mainSeedSize ?? DEFAULT_MAIN_SEED,
    mainCap: opts.mainCap ?? DEFAULT_MAIN_CAP,
    heats,
    mains: [],
  };
  return recompute(hm);
}

export function allHeatsRun(hm: HeatMains): boolean {
  return hm.heats.length > 0 && hm.heats.every((h) => h.results != null);
}

/** Non-DQ'd top-N of a completed race (the drivers who transfer up). */
function topTransfer(race: HRace, transfer: number): string[] {
  if (!race.results) return [];
  return race.results.filter((id) => !race.dq.includes(id)).slice(0, transfer);
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && new Set([...a, ...b]).size === a.length;

/**
 * Rebuild the mains from the current heat + main results. Reseeds from heat
 * points (winners locked first), fills each main bottom-up with the transfers
 * from the main below, and preserves a main's results only while its driver set
 * is unchanged (so editing an upstream race invalidates exactly what it must).
 */
function recompute(hm: HeatMains): HeatMains {
  const clone = deep(hm);
  if (!allHeatsRun(clone)) {
    clone.mains = [];
    return clone;
  }

  // Total points across every heat + who won a heat.
  const pts = new Map<string, number>(clone.field.map((id) => [id, 0]));
  const winners = new Set<string>();
  for (const h of clone.heats) {
    (h.results ?? []).forEach((id, pos) => {
      if (h.dq.includes(id)) return;
      pts.set(id, (pts.get(id) ?? 0) + heatPoints(pos));
      if (pos === 0) winners.add(id);
    });
  }

  // Rank: heat winners first (they always make the A Main), then everyone by
  // total points. Ties + surplus winners fall back to points, then id.
  const rank = [...clone.field].sort((a, b) => {
    const aw = winners.has(a) ? 1 : 0;
    const bw = winners.has(b) ? 1 : 0;
    if (aw !== bw) return bw - aw;
    const pd = (pts.get(b) ?? 0) - (pts.get(a) ?? 0);
    if (pd) return pd;
    return a < b ? -1 : 1;
  });

  // Chunk into mains of mainSeedSize (A gets the top seeds, etc.).
  const mainCount = Math.max(1, Math.ceil(clone.field.length / clone.mainSeedSize));
  const seeds: string[][] = Array.from({ length: mainCount }, () => []);
  rank.forEach((id, i) => seeds[Math.min(mainCount - 1, Math.floor(i / clone.mainSeedSize))].push(id));

  const prior = new Map(clone.mains.map((m) => [m.tier ?? 0, m]));
  const mains: HRace[] = Array.from({ length: mainCount }, (_, t) => ({
    id: `main-${t}`,
    label: mainLabel(t),
    kind: "main" as const,
    tier: t,
    raceCount: t === 0 ? A_MAIN_RACES : LOWER_MAIN_RACES,
    drivers: [],
    results: null as string[] | null,
    dq: [] as string[],
  }));

  // Fill bottom-up: each main = its seeds + the transfers from the main below.
  for (let t = mainCount - 1; t >= 0; t--) {
    let drivers = [...seeds[t]];
    if (t < mainCount - 1 && mains[t + 1].results) {
      drivers = [...drivers, ...topTransfer(mains[t + 1], clone.transfer)];
    }
    mains[t].drivers = drivers;
    const old = prior.get(t);
    if (old?.results && sameSet(old.results, drivers)) {
      mains[t].results = old.results;
      mains[t].dq = old.dq;
    }
  }

  clone.mains = mains;
  return clone;
}

/** Report (or edit) a heat's finishing order. `dq` lists disqualified ids. */
export function reportHeatResult(hm: HeatMains, heatId: string, order: string[], dq: string[] = []): HeatMains {
  const clone = deep(hm);
  const heat = clone.heats.find((h) => h.id === heatId);
  if (!heat) return clone;
  heat.results = order;
  heat.dq = dq;
  return recompute(clone);
}

/** Report (or edit) a main's finishing order by tier (0 = A). Recomputes the
 *  transfers into the mains above it. */
export function reportMainResult(hm: HeatMains, tier: number, order: string[], dq: string[] = []): HeatMains {
  const clone = deep(hm);
  const main = clone.mains.find((m) => (m.tier ?? 0) === tier);
  if (!main) return clone;
  main.results = order;
  main.dq = dq;
  return recompute(clone);
}

/** The lowest un-run main that's ready to race (its feeder below has finished). */
export function nextMainTier(hm: HeatMains): number | null {
  if (!allHeatsRun(hm) || hm.mains.length === 0) return null;
  for (let t = hm.mains.length - 1; t >= 0; t--) {
    if (hm.mains[t].results) continue;
    const below = hm.mains[t + 1];
    if (!below || below.results) return t;
  }
  return null;
}

export function heatMainsChampion(hm: HeatMains): string | null {
  return hm.mains[0]?.results?.[0] ?? null;
}

/** Which phase the ladder is on — for UI. */
export function heatMainsStage(hm: HeatMains): "heats" | "mains" | "complete" {
  if (!allHeatsRun(hm)) return "heats";
  if (hm.mains.length > 0 && hm.mains.every((m) => m.results != null)) return "complete";
  return "mains";
}

/**
 * Overall standings. Walk the mains top-down (A first) and take each driver the
 * first time they appear — transferred drivers land in the higher main, so the
 * A Main gives 1..k, the B Main its non-transfers next, and so on. DQ'd drivers
 * already sit at the back of each main's order.
 */
export function heatMainsStandings(hm: HeatMains): { participantId: string; placement: number }[] {
  if (!allHeatsRun(hm)) return [];
  // Drivers DQ'd in the main they finished drop below everyone else.
  const dqd = new Set<string>();
  for (const m of hm.mains) for (const id of m.dq) dqd.add(id);

  const seen = new Set<string>();
  const rows: string[] = [];
  const tail: string[] = [];
  for (const m of hm.mains) {
    for (const id of m.results ?? m.drivers) {
      if (seen.has(id)) continue;
      seen.add(id);
      (dqd.has(id) ? tail : rows).push(id);
    }
  }
  return [...rows, ...tail].map((participantId, i) => ({ participantId, placement: i + 1 }));
}
