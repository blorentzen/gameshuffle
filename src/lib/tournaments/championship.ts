/**
 * Championship / league points for the Heat → Mains format. A season is a run of
 * events; each event awards points and the season standings are the sum.
 *
 * An event gives a driver two things, added together:
 *   • Heat bonus  — light points for heat finishes, summed across the heats they
 *     ran. A warmup edge, never decisive.
 *   • Main points — the weight, scored on the driver's FINAL main + placement.
 *     Scored on where you *finish*, never where you passed through: transfer
 *     B→A and you earn A-Main points at your A placement (nothing from the B);
 *     stay in the B and you earn B-Main points. One placement, one score.
 *
 * The "Tiered" curve gives each main its own band with a deliberate gap below
 * it, so fighting into the A Main is worth a jump. A 12-cap league simply uses
 * the A-Main band only (heats still run as warmup).
 */

import type { HeatMains, HRace } from "./heatMains";

export interface PointsConfig {
  heat: number[]; // heat finishing position → points (index 0 = 1st)
  mains: number[][]; // per tier (0 = A) → placement → points
  mainTail: number; // fallback for placements beyond a tier's table
}

/** Default MK8DX-flavoured curve — A Main premium with tier gaps. */
export const TIERED_POINTS: PointsConfig = {
  heat: [5, 3, 2, 1],
  mains: [
    [100, 88, 78, 69, 61, 54, 48, 43, 39, 36, 34, 32], // A Main (the show)
    [24, 21, 18, 16, 14, 12, 10, 8, 6, 5], // B Main (non-transfers)
    [4, 3, 2, 1], // C Main
  ],
  mainTail: 1,
};

export interface DriverPoints {
  participantId: string;
  heatPoints: number;
  mainPoints: number;
  total: number;
  finalMainTier: number | null; // 0 = A Main; null if they never reached a main
  finalMainLabel: string;
  finalPlacement: number | null; // placement within their final main (1-based)
  dq: boolean;
}

function topTransfer(race: HRace, transfer: number): string[] {
  if (!race.results) return [];
  return race.results.filter((id) => !race.dq.includes(id)).slice(0, transfer);
}

const mainLetter = (tier: number) => `${String.fromCharCode(65 + tier)} Main`;

/** Points a single completed (or partial) event awards each driver. */
export function computeEventPoints(hm: HeatMains, cfg: PointsConfig = TIERED_POINTS): DriverPoints[] {
  const heatPoints = new Map<string, number>(hm.field.map((id) => [id, 0]));
  for (const h of hm.heats) {
    (h.results ?? []).forEach((id, pos) => {
      if (h.dq.includes(id)) return;
      heatPoints.set(id, (heatPoints.get(id) ?? 0) + (cfg.heat[pos] ?? 0));
    });
  }

  const mainPoints = new Map<string, number>(hm.field.map((id) => [id, 0]));
  const finalTier = new Map<string, number>();
  const finalPlace = new Map<string, number>();
  const dqd = new Set<string>();

  hm.mains.forEach((m, t) => {
    if (!m.results) return;
    const table = cfg.mains[t] ?? [];
    // Top N of a lower main transferred up → they're scored in the main above.
    const transferredOut = t > 0 ? topTransfer(m, hm.transfer) : [];
    const remaining = m.results.filter((id) => !transferredOut.includes(id));
    let place = 0;
    for (const id of remaining) {
      finalTier.set(id, t);
      if (m.dq.includes(id)) {
        dqd.add(id); // no main points; drops below the field
        continue;
      }
      mainPoints.set(id, table[place] ?? cfg.mainTail);
      finalPlace.set(id, place + 1);
      place += 1;
    }
  });

  const rows: DriverPoints[] = hm.field.map((id) => {
    const hp = heatPoints.get(id) ?? 0;
    const mp = mainPoints.get(id) ?? 0;
    const tier = finalTier.has(id) ? (finalTier.get(id) as number) : null;
    return {
      participantId: id,
      heatPoints: hp,
      mainPoints: mp,
      total: hp + mp,
      finalMainTier: tier,
      finalMainLabel: tier == null ? "—" : hm.mains[tier]?.label ?? mainLetter(tier),
      finalPlacement: finalPlace.has(id) ? (finalPlace.get(id) as number) : null,
      dq: dqd.has(id),
    };
  });

  rows.sort((a, b) => b.total - a.total || b.mainPoints - a.mainPoints || (a.participantId < b.participantId ? -1 : 1));
  return rows;
}

export interface SeasonRow {
  participantId: string;
  total: number;
  events: number; // events this driver scored in
  best: number; // best single-event points
  perEvent: number[]; // points per event, in order
}

/**
 * Accumulate a season from a list of per-event point maps. `dropWorst` discards
 * each driver's N lowest events before summing (a common league rule; 0 = off).
 */
export function accumulateSeason(events: Record<string, number>[], dropWorst = 0): SeasonRow[] {
  const ids = new Set<string>();
  for (const e of events) for (const id of Object.keys(e)) ids.add(id);

  const rows: SeasonRow[] = [...ids].map((id) => {
    const perEvent = events.map((e) => e[id] ?? 0);
    const scored = perEvent.filter((_, i) => events[i][id] != null);
    const counted = dropWorst > 0 ? [...scored].sort((a, b) => a - b).slice(dropWorst) : scored;
    return {
      participantId: id,
      total: counted.reduce((s, n) => s + n, 0),
      events: scored.length,
      best: scored.length ? Math.max(...scored) : 0,
      perEvent,
    };
  });

  rows.sort((a, b) => b.total - a.total || b.best - a.best || (a.participantId < b.participantId ? -1 : 1));
  return rows;
}
