/**
 * MMR card rules (pure, client-safe). The card shows a Mario Kart lounge
 * player's rating from MKCentral's public lounge API: the number, the
 * division, how far to the next one, tonight's run, the last ten events and
 * the moments a stream sees when an event lands. Decided in the MMR card picks
 * (2026-10-20, all as recommended, three rounds).
 *
 * MMR changes once per verified event (a 12-race table), never per race.
 */

export type MmrGame = "mkworld12p" | "mkworld24p" | "mk8dx";

export const MMR_GAMES: Record<MmrGame, { label: string; short: string; family: "mario-kart-world" | "mario-kart-8-deluxe" }> = {
  mkworld12p: { label: "Mario Kart World, 12 players", short: "MK World 12P", family: "mario-kart-world" },
  mkworld24p: { label: "Mario Kart World, 24 players", short: "MK World 24P", family: "mario-kart-world" },
  mk8dx: { label: "Mario Kart 8 Deluxe", short: "MK8DX", family: "mario-kart-8-deluxe" },
};
export const MMR_GAME_IDS = Object.keys(MMR_GAMES) as MmrGame[];
export const isMmrGame = (v: unknown): v is MmrGame => typeof v === "string" && v in MMR_GAMES;

/** Which lounge game follows a GameShuffle game slug (the Twitch category on stream). */
export function gameForSlug(slug: string | null | undefined, prefer: MmrGame = "mkworld12p"): MmrGame | null {
  if (!slug) return null;
  if (slug.startsWith("mario-kart-world")) return MMR_GAMES[prefer].family === "mario-kart-world" ? prefer : "mkworld12p";
  if (slug.startsWith("mario-kart-8")) return "mk8dx";
  return null;
}

// ── Divisions ─────────────────────────────────────────────────────────────

export interface DivisionStep { name: string; at: number }

/** Division starts as the lounge's stats endpoint gave them on 2026-10-20 (MK World season 3,
 *  MK8DX season 16). The live numbers come from that endpoint; these cover an outage. */
export const FALLBACK_RANKS: Record<MmrGame, Record<string, number>> = {
  mkworld12p: { Iron: 0, Bronze: 2000, Silver: 4000, Gold: 6000, Platinum: 8000, Sapphire: 9500, Ruby: 11000, Diamond: 12500, Master: 14000, Grandmaster: 15000 },
  mkworld24p: { Iron: 0, Bronze: 2000, Silver: 4000, Gold: 6000, Platinum: 8000, Sapphire: 10000, Ruby: 11500, Diamond: 13000, Master: 14500, Grandmaster: 15500 },
  mk8dx: {
    "Iron 1": 0, "Iron 2": 1000, "Bronze 1": 2000, "Bronze 2": 3000, "Silver 1": 4000, "Silver 2": 5000, "Gold 1": 6000, "Gold 2": 7000,
    "Platinum 1": 8000, "Platinum 2": 9000, "Sapphire 1": 10000, "Sapphire 2": 11000, "Ruby 1": 12000, "Ruby 2": 13000,
    "Diamond 1": 14000, "Diamond 2": 15000, Master: 16000, Grandmaster: 17000,
  },
};

export function stepsFrom(ranks: Record<string, number> | null | undefined, game: MmrGame): DivisionStep[] {
  const src = ranks && Object.keys(ranks).length ? ranks : FALLBACK_RANKS[game];
  return Object.entries(src)
    .filter(([, at]) => Number.isFinite(at))
    .map(([name, at]) => ({ name, at }))
    .sort((a, b) => a.at - b.at);
}

/** "Platinum 2" → base Platinum, level 2. MK World divisions have no level. */
export function splitDivision(name: string): { base: string; level: number | null } {
  const m = /^(.*?)\s+(\d+)$/.exec(name.trim());
  return m ? { base: m[1], level: Number(m[2]) } : { base: name.trim(), level: null };
}

export interface Standing {
  /** The division by the number (the lounge's own `rank` wins when it's given). */
  division: string;
  next: DivisionStep | null;
  toNext: number | null;
  /** 0 to 1 through the current division (1 in the top one). */
  pct: number;
}

export function standing(mmr: number | null, steps: DivisionStep[], given?: string | null): Standing {
  if (mmr == null || !steps.length) return { division: given || "Placement", next: null, toNext: null, pct: 0 };
  let i = 0;
  for (let k = 0; k < steps.length; k++) if (mmr >= steps[k].at) i = k;
  const cur = steps[i], next = steps[i + 1] ?? null;
  const pct = next ? Math.max(0, Math.min(1, (mmr - cur.at) / (next.at - cur.at))) : 1;
  // A placement player has a number but no division yet; the lounge says so.
  const division = given === "Placement" ? "Placement" : cur.name;
  return { division, next, toNext: next ? next.at - mmr : null, pct };
}

// ── Events ────────────────────────────────────────────────────────────────

export interface MmrChange {
  id: number;
  mmr: number;
  delta: number;
  at: string;
  /** "Table" is an event; "Placement" the starting number; penalties and bonuses move the number quietly. */
  reason: string;
  place: number | null;
  score: number | null;
  tier: string | null;
  /** Teams and players in the event (12 teams of 12 players = free-for-all, 6 = 2v2, ...). The lounge page reads these. */
  teams?: number | null;
  players?: number | null;
  /** Teammates on a team event, by MKCentral id, with their scores. */
  partners?: number[];
  partnerScores?: number[];
}

export const isEvent = (c: MmrChange) => c.reason === "Table";

/** Tonight's run since `since`: the number's change (penalties included) and the events' record. */
export function tonightRun(changes: MmrChange[], since: string | null): { delta: number; w: number; l: number; events: number } {
  const t0 = since ? Date.parse(since) : NaN;
  let delta = 0, w = 0, l = 0;
  for (const c of changes) {
    if (!Number.isFinite(t0) || Date.parse(c.at) < t0) continue;
    if (c.reason === "Placement") continue;
    delta += c.delta;
    if (isEvent(c)) { if (c.delta > 0) w++; else l++; }
  }
  return { delta, w, l, events: w + l };
}

/** Wins in a row from the newest event back (changes are newest first). */
export function winStreak(changes: MmrChange[]): number {
  let n = 0;
  for (const c of changes) {
    if (!isEvent(c)) continue;
    if (c.delta > 0) n++;
    else break;
  }
  return n;
}

export type Square = "w" | "l" | "p";

/** The last `count` events as squares, oldest first: a gain, a loss, or a gain to a new season peak. */
export function formSquares(changes: MmrChange[], count = 10): Square[] {
  const oldest = [...changes].reverse();
  let peak = -Infinity;
  const marks: Square[] = [];
  for (const c of oldest) {
    const before = peak;
    peak = Math.max(peak, c.mmr);
    if (!isEvent(c)) continue;
    marks.push(c.delta > 0 ? (c.mmr > before && before > -Infinity ? "p" : "w") : "l");
  }
  return marks.slice(-count);
}

/** True when this change took the number past every earlier one this season. */
export function setsPeak(changes: MmrChange[], id: number): boolean {
  const oldest = [...changes].reverse();
  let peak = -Infinity;
  for (const c of oldest) {
    if (c.id === id) return isEvent(c) && c.delta > 0 && peak > -Infinity && c.mmr > peak;
    peak = Math.max(peak, c.mmr);
  }
  return false;
}

/** World rank milestones, best first: a laurel the first time a player gets inside one. */
export const MILESTONES = [10, 100, 250, 1000] as const;
export function milestoneTier(rank: number | null | undefined): number | null {
  if (!rank || rank < 1) return null;
  return MILESTONES.find((m) => rank <= m) ?? null;
}

export function placeWord(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

export const fmtMmr = (n: number) => Math.round(n).toLocaleString("en-US");
/** "+42" / "−35" (a real minus sign). */
export const signed = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(Math.round(n)).toLocaleString("en-US")}`;

// ── What the card shows ───────────────────────────────────────────────────

export interface MmrSource {
  name: string;
  country: string | null;
  game: MmrGame;
  mmr: number | null;
  maxMmr: number | null;
  /** The lounge's division name for the player ("Gold", "Platinum 2", "Placement"). */
  division: string | null;
  worldRank: number | null;
  steps: DivisionStep[];
  /** Newest first. */
  changes: MmrChange[];
  /** When tonight's run starts counting. */
  since: string | null;
  avatar: string | null;
  /** The player's place among their country's players (read only when a look shows it). */
  countryRank?: number | null;
  /** Players with an event this season, for "Top 9%". */
  totalPlayers?: number | null;
}

/** One of the newest events, for the card's recent events. */
export interface MmrRecent {
  id: number;
  at: string;
  tier: string | null;
  teams: number | null;
  players: number | null;
  place: number | null;
  delta: number;
}

export interface MmrView {
  name: string;
  country: string | null;
  game: MmrGame;
  mmr: number | null;
  division: string;
  next: DivisionStep | null;
  toNext: number | null;
  pct: number;
  worldRank: number | null;
  peak: number | null;
  tonight: { delta: number; w: number; l: number; events: number };
  squares: Square[];
  streak: number;
  /** The newest event, for the delta chip. */
  last: { delta: number; place: number | null; peak: boolean } | null;
  avatar: string | null;
  countryRank: number | null;
  totalPlayers: number | null;
  /** This season so far, worked out from the changes (it matches MKCentral's own numbers, and a moment counts its event). */
  season: { events: number; wins: number; avgScore: number | null };
  /** The newest events, newest first (up to five). */
  recent: MmrRecent[];
  /** When the season peak was first reached (null when it's older than the changes on hand). */
  peakAt: string | null;
}

/** This season's events, wins and average score from the changes (newest first). */
export function seasonNumbers(changes: MmrChange[]): MmrView["season"] {
  let events = 0, wins = 0, scored = 0, total = 0;
  for (const c of changes) {
    if (!isEvent(c)) continue;
    events++;
    if (c.delta > 0) wins++;
    if (c.score != null) { scored++; total += c.score; }
  }
  return { events, wins, avgScore: scored ? total / scored : null };
}

/** The card as it stood after the change `uptoId` (the latest when left out). */
export function viewOf(src: MmrSource, uptoId?: number): MmrView {
  const idx = uptoId == null ? 0 : Math.max(0, src.changes.findIndex((c) => c.id === uptoId));
  const changes = src.changes.slice(idx);
  const top = changes[0] ?? null;
  const mmr = uptoId == null ? src.mmr ?? top?.mmr ?? null : top?.mmr ?? src.mmr;
  const latest = idx === 0;
  const st = standing(mmr, src.steps, latest ? src.division : null);
  const peakSoFar = changes.reduce((p, c) => Math.max(p, c.mmr), -Infinity);
  const peak = latest && src.maxMmr != null ? Math.max(src.maxMmr, peakSoFar) : Number.isFinite(peakSoFar) ? peakSoFar : src.maxMmr;
  const lastEvent = changes.find(isEvent) ?? null;
  return {
    name: src.name,
    country: src.country,
    game: src.game,
    mmr,
    division: st.division,
    next: st.next,
    toNext: st.toNext,
    pct: st.pct,
    worldRank: src.worldRank,
    peak: peak ?? null,
    tonight: tonightRun(changes, src.since),
    squares: formSquares(changes),
    streak: winStreak(changes),
    last: lastEvent && top && top.id === lastEvent.id ? { delta: lastEvent.delta, place: lastEvent.place, peak: setsPeak(changes, lastEvent.id) } : null,
    avatar: src.avatar,
    countryRank: src.countryRank ?? null,
    totalPlayers: src.totalPlayers ?? null,
    season: seasonNumbers(changes),
    recent: changes.filter(isEvent).slice(0, 5).map((c) => ({ id: c.id, at: c.at, tier: c.tier, teams: c.teams ?? null, players: c.players ?? null, place: c.place, delta: c.delta })),
    // Changes are newest first, so the last one at the peak is the first time it was reached.
    peakAt: peak != null ? ([...changes].reverse().find((c) => c.mmr >= peak)?.at ?? null) : null,
  };
}

/** A made-up season for previews: a climb through Gold over the last few weeks, then tonight's
 *  win, loss, win, a climb into Platinum, a streak and a new peak (DEMO_EVENTS). */
export function demoSource(game: MmrGame = "mkworld12p", name = "Sam"): MmrSource {
  const base = Date.parse("2026-10-20T01:00:00Z");
  // Earlier in the season: [mmr after, delta, place, tier]. Every number stays under tonight's 8,040 peak.
  const season: [number, number, number, string][] = [
    [6180, 180, 2, "D"], [6110, -70, 8, "D"], [6290, 180, 1, "D"], [6420, 130, 3, "C"], [6370, -50, 7, "C"], [6510, 140, 2, "C"],
    [6460, -50, 9, "C"], [6600, 140, 1, "C"], [6720, 120, 3, "C"], [6650, -70, 10, "B"], [6780, 130, 2, "C"], [6900, 120, 4, "C"],
    [6830, -70, 8, "B"], [6960, 130, 2, "B"], [6910, -50, 7, "C"], [7050, 140, 1, "B"], [7170, 120, 3, "B"], [7110, -60, 9, "B"],
    [7230, 120, 2, "B"], [7180, -50, 8, "B"], [7300, 120, 3, "B"], [7420, 120, 2, "B"], [7350, -70, 10, "A"], [7470, 120, 2, "B"],
    [7400, -70, 9, "A"], [7520, 120, 3, "B"], [7480, -40, 7, "B"], [7600, 120, 2, "B"],
  ];
  const older: MmrChange[] = [
    { id: 900, mmr: 6000, delta: 0, at: new Date(base - 30 * 86_400_000).toISOString(), reason: "Placement", place: null, score: null, tier: null },
    ...season.map(([mmr, delta, place, tier], i): MmrChange => ({
      id: 901 + i, mmr, delta, at: new Date(base - (28 - i) * 86_400_000).toISOString(), reason: "Table", place, score: scoreFor(place, i), tier,
      teams: i % 5 === 3 ? 6 : 12, players: 12,
    })),
  ];
  // Tonight so far (the first row is where tonight's session picked up).
  const rows: [number, number, number, string][] = [
    [7820, 220, 1, "B"], [8040, 220, 1, "A"], [7960, -80, 9, "A"], [7890, -70, 8, "B"], [7870, -20, 6, "B"], [7912, 42, 2, "B"],
  ];
  const tonight: MmrChange[] = rows.map(([mmr, delta, place, tier], i) => ({
    id: 1001 + i, mmr, delta, at: new Date(base + (i + 1) * 1800_000).toISOString(),
    reason: "Table", place, score: scoreFor(place, i + 3), tier, teams: i === 3 ? 6 : 12, players: 12,
  }));
  const changes = [...older, ...tonight].reverse();
  return {
    name, country: "US", game, mmr: 7912, maxMmr: 8040, division: null, worldRank: 1240,
    steps: stepsFrom(null, game), changes, since: new Date(base + 6.5 * 1800_000).toISOString(), avatar: null,
    countryRank: 118, totalPlayers: 6000,
  };
}

/** A plausible free-for-all score for a place (a 12-race event). */
function scoreFor(place: number, i = 0): number {
  return Math.max(28, 126 - place * 8 + ((i * 7) % 9) - 4);
}

/** The demo night's next events, played on previews in a loop. */
export const DEMO_EVENTS: { delta: number; place: number; tier?: string }[] = [
  { delta: 42, place: 1, tier: "B" }, { delta: -35, place: 9, tier: "A" }, { delta: 58, place: 2, tier: "A" }, { delta: 49, place: 1, tier: "A" }, { delta: 44, place: 3, tier: "A" },
];

export function withEvent(src: MmrSource, ev: { delta: number; place: number; tier?: string }): MmrSource {
  const top = src.changes[0];
  const mmr = (src.mmr ?? top?.mmr ?? 0) + ev.delta;
  const change: MmrChange = {
    id: (top?.id ?? 0) + 1, mmr, delta: ev.delta, at: new Date((top ? Date.parse(top.at) : Date.now()) + 1800_000).toISOString(),
    reason: "Table", place: ev.place, score: scoreFor(ev.place, (top?.id ?? 0) % 9), tier: ev.tier ?? top?.tier ?? null, teams: 12, players: 12,
  };
  const move = (rank: number | null | undefined, scale: number) => (rank ? Math.max(1, rank - Math.round((ev.delta * rank) / scale)) : rank ?? null);
  return { ...src, mmr, maxMmr: Math.max(src.maxMmr ?? 0, mmr), division: null, worldRank: move(src.worldRank, 1200), countryRank: move(src.countryRank, 1200), changes: [change, ...src.changes] };
}
