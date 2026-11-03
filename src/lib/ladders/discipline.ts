/**
 * Penalties, strikes, breaks and reduced loss (lounge system picks 2026-11-01, picks 7A and 8A; automation picks,
 * https://claude.ai/artifact/JjiP8RDDdr6onMy1usw6My, picks 3 and 8). Pure, client-safe. Every number is a setting.
 *
 *   - Penalty kinds with their starting values (common lounge rules): late −50 and 1 strike, dropped before race 1
 *     −200 and 2 strikes, dropped mid-room −100 and 1 strike, wrong tag −50, and staff's own amount.
 *   - Strikes last 30 days. Three active strikes start a 7-day break from the queue (tables already in still count).
 *   - Reduced loss (MKCentral's rule): when a teammate misses races, each other player on the team loses less:
 *     3 to 7 missed races multiply the loss by 1 − (missed − 2)/6, 8 or more mean no loss. Gains are untouched.
 */

export type PenaltyKind = "late" | "drop_before" | "drop_during" | "tag" | "other";

export interface DisciplineSettings {
  penalties: Record<PenaltyKind, { mmr: number; strikes: number; label: string }>;
  strikeDays: number;
  breakAt: number;
  breakDays: number;
  reducedLoss: { from: number; none: number } | null;
}

export const DEFAULT_DISCIPLINE: DisciplineSettings = {
  penalties: {
    late: { mmr: 50, strikes: 1, label: "Late" },
    drop_before: { mmr: 200, strikes: 2, label: "Dropped before race 1" },
    drop_during: { mmr: 100, strikes: 1, label: "Dropped during the room" },
    tag: { mmr: 50, strikes: 0, label: "Wrong tag" },
    other: { mmr: 0, strikes: 0, label: "Penalty" },
  },
  strikeDays: 30,
  breakAt: 3,
  breakDays: 7,
  reducedLoss: { from: 3, none: 8 },
};

const int = (v: unknown, lo: number, hi: number, d: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };

/** Stored discipline settings read safely. */
export function cleanDiscipline(raw: unknown): DisciplineSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof DisciplineSettings, unknown>>;
  const d = DEFAULT_DISCIPLINE;
  const pen = (r.penalties && typeof r.penalties === "object" ? r.penalties : {}) as Record<string, { mmr?: unknown; strikes?: unknown; label?: unknown }>;
  const penalties = Object.fromEntries((Object.keys(d.penalties) as PenaltyKind[]).map((k) => [k, {
    mmr: int(pen[k]?.mmr, 0, 5000, d.penalties[k].mmr),
    strikes: int(pen[k]?.strikes, 0, 5, d.penalties[k].strikes),
    label: typeof pen[k]?.label === "string" && String(pen[k]!.label).trim() ? String(pen[k]!.label).trim().slice(0, 40) : d.penalties[k].label,
  }])) as DisciplineSettings["penalties"];
  const rl = r.reducedLoss === null ? null : (r.reducedLoss && typeof r.reducedLoss === "object" ? r.reducedLoss as { from?: unknown; none?: unknown } : {});
  return {
    penalties,
    strikeDays: int(r.strikeDays, 1, 365, d.strikeDays),
    breakAt: int(r.breakAt, 0, 10, d.breakAt),
    breakDays: int(r.breakDays, 0, 365, d.breakDays),
    reducedLoss: rl === null ? null : (() => { const from = int(rl.from, 1, 11, 3); return { from, none: int(rl.none, from + 1, 12, Math.max(from + 1, 8)) }; })(),
  };
}

export interface Strike { at: string; count: number; undone?: boolean }

/** Strikes still active at `now`. */
export function activeStrikes(strikes: Strike[], s: Pick<DisciplineSettings, "strikeDays">, now: Date): number {
  const since = now.getTime() - s.strikeDays * 86_400_000;
  return strikes.filter((x) => !x.undone && Date.parse(x.at) > since).reduce((a, x) => a + x.count, 0);
}

/** When a penalty with `adds` strikes would start a break: the break's end, else null. */
export function breakAfter(strikes: Strike[], adds: number, s: Pick<DisciplineSettings, "strikeDays" | "breakAt" | "breakDays">, now: Date): Date | null {
  if (!s.breakAt || !s.breakDays || adds <= 0) return null;
  const before = activeStrikes(strikes, s, now);
  return before < s.breakAt && before + adds >= s.breakAt ? new Date(now.getTime() + s.breakDays * 86_400_000) : null;
}

/** The loss multiplier for a teammate of someone who missed `missed` races (1 = full loss, 0 = none). */
export function teammateLossMultiplier(missed: number, rule: DisciplineSettings["reducedLoss"]): number {
  if (!rule || missed < rule.from) return 1;
  if (missed >= rule.none) return 0;
  const steps = rule.none - rule.from + 1;
  return Math.round((1 - (missed - rule.from + 1) / steps) * 1000) / 1000;
}

/**
 * Reduced loss on a room's changes: for each player who missed races, every other player on their team loses less
 * (the biggest miss on a team counts). Gains and the missing player's own change are untouched. Nobody below 1.
 */
export function applyReducedLoss<C extends { key: string; team: number; before: number; delta: number; after: number }>(
  changes: C[], missed: { key: string; races: number }[], rule: DisciplineSettings["reducedLoss"],
): (C & { multiplier: number | null })[] {
  const teamOf = new Map(changes.map((c) => [c.key, c.team]));
  const worst = new Map<number, { races: number; keys: Set<string> }>();
  for (const m of missed) {
    const t = teamOf.get(m.key);
    if (t == null) continue;
    const w = worst.get(t) ?? { races: 0, keys: new Set<string>() };
    w.races = Math.max(w.races, m.races);
    w.keys.add(m.key);
    worst.set(t, w);
  }
  return changes.map((c) => {
    const w = worst.get(c.team);
    if (!w || w.keys.has(c.key) || c.delta >= 0) return { ...c, multiplier: null };
    const mult = teammateLossMultiplier(w.races, rule);
    if (mult === 1) return { ...c, multiplier: null };
    const delta = Math.ceil(c.delta * mult);
    const after = Math.max(1, c.before + delta);
    return { ...c, delta: after - c.before, after, multiplier: mult };
  });
}

/** A season's soft reset: everyone keeps `keep` of their distance from the middle (0.5 = halfway back). */
export function softReset(mmr: number, middle: number, keep = 0.5): number {
  return Math.max(1, Math.round(middle + (mmr - middle) * keep));
}

/**
 * The submit form's "Missed races" box: "Vex 5, Dot 3" (commas or new lines) matched to the room's players by name
 * (one or two letters off still matches). Races are 1 to 12; anything unreadable comes back in `unread`.
 */
export function parseMissed(text: string, players: { key: string; name: string }[], distance: (a: string, b: string) => number): { missed: { key: string; races: number }[]; unread: string[] } {
  const missed: { key: string; races: number }[] = [];
  const unread: string[] = [];
  for (const raw of text.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean)) {
    const m = /^(.+?)\s*[:=-]?\s*(\d{1,2})(?:\s*races?)?$/i.exec(raw);
    if (!m) { unread.push(raw); continue; }
    const races = Number(m[2]);
    const key = m[1].trim().toLowerCase().replace(/\s+/g, " ");
    let best: { key: string; d: number } | null = null;
    for (const p of players) { const d = p.key === key ? 0 : distance(p.key, key); if (d <= (key.length <= 4 ? 1 : 2) && (!best || d < best.d)) best = { key: p.key, d }; }
    if (!best || races < 1 || races > 12) { unread.push(raw); continue; }
    if (!missed.some((x) => x.key === best!.key)) missed.push({ key: best.key, races });
  }
  return { missed, unread };
}
