/**
 * Heat → Mains format (Tournament Overhaul — experimental). A transfer/consi
 * ladder inspired by dirt-track / sprint-car racing, novel for Mario Kart:
 *
 *   1. The field is split into HEATS (e.g. 16 → 4 heats of 4).
 *   2. Win your heat → locked into the A MAIN. Everyone else drops to the B MAIN.
 *   3. The B Main runs; its top `transfer` finishers move UP into the A Main.
 *   4. The A Main decides the podium; B-Main non-transfers take the lower placings.
 *
 * This gives everyone a path back from a bad heat. Pure + game-agnostic —
 * operates on driver ids and finishing order. C/D mains and points-accumulation
 * are natural v2 extensions (the model already carries races generically).
 */

export interface HeatRace {
  id: string;
  label: string;
  drivers: string[]; // starting field (driver ids)
  results: string[] | null; // finishing order (ids), null until run
}

export interface HeatMains {
  kind: "heat_mains";
  field: string[];
  heatCount: number;
  transfer: number; // top N of the B Main advance to the A Main
  heats: HeatRace[];
  bMain: HeatRace; // seeded once all heats are run
  aMain: HeatRace;
}

const DEFAULT_TRANSFER = 4;

/** Round-robin split of the field into `heatCount` heats (balanced). */
export function generateHeatMains(field: string[], heatCount = 4, transfer = DEFAULT_TRANSFER): HeatMains {
  const hc = Math.max(2, Math.min(heatCount, Math.floor(field.length / 2)));
  const heats: HeatRace[] = Array.from({ length: hc }, (_, i) => ({
    id: `heat-${i}`,
    label: `Heat ${String.fromCharCode(65 + i)}`,
    drivers: [],
    results: null,
  }));
  field.forEach((id, i) => heats[i % hc].drivers.push(id));
  return {
    kind: "heat_mains",
    field,
    heatCount: hc,
    transfer: Math.max(1, transfer),
    heats,
    bMain: { id: "b-main", label: "B Main", drivers: [], results: null },
    aMain: { id: "a-main", label: "A Main", drivers: [], results: null },
  };
}

export function allHeatsRun(hm: HeatMains): boolean {
  return hm.heats.every((h) => h.results != null);
}

/** Seed the mains from heat results: winners lock into A, the rest fill B
 *  (ordered by heat finishing position). Mutates + returns. */
function seedMains(hm: HeatMains): HeatMains {
  const winners: string[] = [];
  const rest: { id: string; pos: number; heat: number }[] = [];
  hm.heats.forEach((h, hi) => {
    (h.results ?? []).forEach((id, pos) => {
      if (pos === 0) winners.push(id);
      else rest.push({ id, pos, heat: hi });
    });
  });
  rest.sort((a, b) => a.pos - b.pos || a.heat - b.heat);
  hm.aMain.drivers = [...winners];
  hm.bMain.drivers = rest.map((r) => r.id);
  return hm;
}

/** Report a heat's finishing order (ids). Seeds the mains once all heats run. */
export function reportHeatResult(hm: HeatMains, heatId: string, order: string[]): HeatMains {
  const clone: HeatMains = JSON.parse(JSON.stringify(hm));
  const heat = clone.heats.find((h) => h.id === heatId);
  if (!heat) return clone;
  heat.results = order;
  if (allHeatsRun(clone)) seedMains(clone);
  return clone;
}

/** Report a main's finishing order. The B Main transfers its top N up to A. */
export function reportMainResult(hm: HeatMains, main: "a" | "b", order: string[]): HeatMains {
  const clone: HeatMains = JSON.parse(JSON.stringify(hm));
  if (main === "b") {
    clone.bMain.results = order;
    const movingUp = order.slice(0, clone.transfer);
    for (const id of movingUp) if (!clone.aMain.drivers.includes(id)) clone.aMain.drivers.push(id);
  } else {
    clone.aMain.results = order;
  }
  return clone;
}

export function heatMainsChampion(hm: HeatMains): string | null {
  return hm.aMain.results?.[0] ?? null;
}

/**
 * Final standings once the A Main is run: A-Main order first (1..k), then the
 * B-Main non-transfers (k+1..). Returns [] until the A Main is decided.
 */
export function heatMainsStandings(hm: HeatMains): { participantId: string; placement: number }[] {
  if (!hm.aMain.results) return [];
  const rows: string[] = [...hm.aMain.results];
  const transferred = new Set(hm.aMain.drivers);
  for (const id of hm.bMain.results ?? []) {
    if (!transferred.has(id)) rows.push(id);
  }
  return rows.map((participantId, i) => ({ participantId, placement: i + 1 }));
}

/** Which stage the ladder is on — for UI. */
export function heatMainsStage(hm: HeatMains): "heats" | "b_main" | "a_main" | "complete" {
  if (!allHeatsRun(hm)) return "heats";
  if (!hm.bMain.results) return "b_main";
  if (!hm.aMain.results) return "a_main";
  return "complete";
}
