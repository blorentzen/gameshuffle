/**
 * Group Knockout — the flexible, lobby-based tournament engine (Flexible
 * Tournaments spec, Phase 0). Generalizes "a match" into a LOBBY of N players:
 * each round splits the field into lobbies of `lobbySize`, each lobby runs and
 * produces a finishing order, the top `advance` per lobby move on, and the rest
 * are eliminated (`single`) or drop to a losers bracket (`double`).
 *
 * Pure + game-agnostic: operates on participant ids + finishing order, so the
 * same engine drives the DB-free sandbox and (later) a DB-backed run. Fully
 * recompute-from-results: `results` (keyed by positional lobby id) is the source
 * of truth; the lobby tree is derived, so editing any lobby re-reports and every
 * downstream lobby recomputes (stale results that no longer match a lobby's
 * entrants are dropped).
 *
 * Presets: `lobbySize 2 / advance 1 / single` == classic 1v1 single-elim;
 * `... / double` == classic double-elim. So this subsumes the 1v1 bracket.
 */

export type Bracketing = "single" | "double";
export type LobbyBracket = "wb" | "lb" | "gf";

export interface GroupRules {
  /** Players (or teams) per lobby. 2–12. */
  lobbySize: number;
  /** Top N per lobby that advance. 1 .. lobbySize-1. */
  advance: number;
  /** Non-advancers eliminated (single) or dropped to a losers bracket (double). */
  bracketing: Bracketing;
  /**
   * Double-elim only. `true` (default): the winners + losers brackets converge
   * in a grand final that decides 1st/2nd. `false`: no grand final — the winners
   * champion takes 1st (undefeated) and the losers bracket fills the rest of the
   * placings, so the two brackets can run to their own ends in parallel without
   * waiting on each other.
   */
  grandFinal?: boolean;
}

export interface Lobby {
  /** Positional key, e.g. "wb-r0-s2" — stable across rebuilds. */
  id: string;
  bracket: LobbyBracket;
  round: number; // 0-based within its bracket
  slot: number; // position within the round
  entrants: string[]; // seated participant ids (may be < lobbySize on uneven fields)
  results: string[] | null; // finishing order (a permutation of entrants), or null until run
}

export interface GroupBracket {
  kind: "group_ko";
  rules: GroupRules;
  seeds: string[]; // index 0 = top seed
  /** Source of truth: lobby id -> finishing order. */
  results: Record<string, string[]>;
  /** Derived view rebuilt from `results` on every change. */
  lobbies: Lobby[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function normalizeRules(r: Partial<GroupRules>): GroupRules {
  const lobbySize = clampInt(r.lobbySize ?? 4, 2, 12);
  const advance = clampInt(r.advance ?? 2, 1, lobbySize - 1);
  const bracketing: Bracketing = r.bracketing === "double" ? "double" : "single";
  // Default to a grand final (traditional double elim); only meaningful for double.
  const grandFinal = r.grandFinal !== false;
  return { lobbySize, advance, bracketing, grandFinal };
}

/** True when this bracket converges in a grand final (double + not disabled). */
export function hasGrandFinal(rules: GroupRules): boolean {
  return rules.bracketing === "double" && rules.grandFinal !== false;
}

function clampInt(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function isPermutation(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(b);
  return a.every((x) => set.has(x));
}

/** How many lobbies to split `n` entrants into. `ceil` guarantees no lobby ever
 *  exceeds `lobbySize`; a leftover singleton becomes a bye (a size-1 lobby that
 *  auto-advances), which is correct for odd fields — especially 1v1. */
function lobbyCount(n: number, lobbySize: number): number {
  if (n <= lobbySize) return 1;
  return Math.ceil(n / lobbySize);
}

/** Split `pool` (seed-ordered) into balanced lobbies via snake distribution, so
 *  top seeds spread across lobbies instead of stacking. */
function splitLobbies(pool: string[], lobbySize: number): string[][] {
  const num = lobbyCount(pool.length, lobbySize);
  if (num <= 1) return [pool.slice()];
  const out: string[][] = Array.from({ length: num }, () => []);
  pool.forEach((id, i) => {
    const row = Math.floor(i / num);
    const col = i % num;
    const idx = row % 2 === 0 ? col : num - 1 - col; // snake
    out[idx].push(id);
  });
  return out;
}

/** Ensure at least one entrant is eliminated per lobby (so the field always
 *  shrinks and the bracket terminates), even on a short uneven lobby. */
function perLobbyAdvance(size: number, advance: number): number {
  return Math.max(1, Math.min(advance, size - 1));
}

/** Attach a stored result to a lobby only if it's still a valid finishing order
 *  for the current entrants; otherwise it's stale (an upstream edit changed who
 *  is seated here) and dropped. */
function seatResult(
  results: Record<string, string[]>,
  id: string,
  entrants: string[],
): string[] | null {
  // A size-1 lobby is a bye: the lone entrant auto-advances, no reporting needed.
  if (entrants.length === 1) return entrants.slice();
  const stored = results[id];
  return stored && isPermutation(stored, entrants) ? stored : null;
}

/** True when a lobby is a bye (auto-advancing single entrant, not a real match). */
export function isBye(lobby: Lobby): boolean {
  return lobby.entrants.length === 1;
}

// ---------------------------------------------------------------------------
// Build (recompute from results)
// ---------------------------------------------------------------------------

/** Build the full derived lobby tree from the rules, seeds, and known results. */
function build(rules: GroupRules, seeds: string[], results: Record<string, string[]>): Lobby[] {
  return rules.bracketing === "double"
    ? buildDouble(rules, seeds, results)
    : buildSingle(rules, seeds, results);
}

/** Winners-only ladder. Returns the WB lobbies; also usable by double-elim to
 *  compute WB rounds + per-round droppers. */
function buildWinners(
  rules: GroupRules,
  seeds: string[],
  results: Record<string, string[]>,
): { lobbies: Lobby[]; droppersByRound: string[][]; complete: boolean; winners: string[] } {
  const lobbies: Lobby[] = [];
  const droppersByRound: string[][] = [];
  let pool = seeds.slice();
  let round = 0;

  while (true) {
    const chunks = splitLobbies(pool, rules.lobbySize);
    const roundLobbies: Lobby[] = chunks.map((entrants, slot) => {
      const id = `wb-r${round}-s${slot}`;
      return {
        id,
        bracket: "wb" as const,
        round,
        slot,
        entrants,
        results: seatResult(results, id, entrants),
      };
    });
    lobbies.push(...roundLobbies);

    // Final WB lobby: the ladder ends here.
    if (chunks.length === 1) {
      const fin = roundLobbies[0];
      const complete = !!fin.results;
      const winners = complete ? fin.results!.slice(0, perLobbyAdvance(fin.entrants.length, rules.advance)) : [];
      // The WB-final non-advancers still "drop" (used by double-elim GF feed).
      droppersByRound.push(
        complete ? fin.results!.slice(perLobbyAdvance(fin.entrants.length, rules.advance)) : [],
      );
      return { lobbies, droppersByRound, complete, winners };
    }

    // Multi-lobby round: need every lobby reported to materialize the next.
    if (roundLobbies.some((l) => !l.results)) {
      droppersByRound.push([]);
      return { lobbies, droppersByRound, complete: false, winners: [] };
    }

    const advancers: string[] = [];
    const droppers: string[] = [];
    for (const l of roundLobbies) {
      const k = perLobbyAdvance(l.entrants.length, rules.advance);
      advancers.push(...l.results!.slice(0, k));
      droppers.push(...l.results!.slice(k));
    }
    droppersByRound.push(droppers);
    pool = advancers;
    round++;
  }
}

function buildSingle(rules: GroupRules, seeds: string[], results: Record<string, string[]>): Lobby[] {
  return buildWinners(rules, seeds, results).lobbies;
}

/**
 * Double elimination for groups (v0). Winners ladder as above, but each WB
 * round's non-advancers DROP into a staggered losers ladder: LB round k seats
 * the LB round k-1 survivors plus the WB round k droppers. When both ladders are
 * down to their finalists, a grand-final lobby seats the WB winners + LB
 * survivors (capped at lobbySize) and decides the podium.
 *
 * v0 semantics — coherent and matches the "bottom drops to a lower bracket, lose
 * again = out" mental model; exact seeding of the staggered merges is a knob we
 * expect to refine against the sandbox.
 */
function buildDouble(rules: GroupRules, seeds: string[], results: Record<string, string[]>): Lobby[] {
  const wb = buildWinners(rules, seeds, results);
  const lobbies: Lobby[] = [...wb.lobbies];

  // Losers ladder, staggered against WB rounds.
  const lbLobbies: Lobby[] = [];
  let lbSurvivors: string[] = [];
  let lbComplete = false;
  let lbFinalists: string[] = [];

  const wbRoundsDone = wb.droppersByRound.length;
  let lbRound = 0;
  let stalled = false; // hit an unreported LB round — can't build further
  // Each pass folds one WB round's droppers into the losers ladder; once every
  // WB dropper is in, we KEEP consolidating the survivors until a single LB
  // final lobby remains. (The old loop stopped after the last WB round even when
  // that round still had multiple parallel lobbies, which orphaned every LB
  // winner past the first `lobbySize` when the grand final was seated.)
  let r = 0;
  let guard = 0;
  while (!stalled && guard++ < 200) {
    const incoming = r < wbRoundsDone ? (wb.droppersByRound[r] ?? []) : [];
    r++;
    const pool = [...lbSurvivors, ...incoming];
    if (pool.length === 0) {
      lbSurvivors = [];
      if (r > wbRoundsDone) break; // no droppers left to fold, nothing pooled
      continue;
    }

    const noMoreIncoming = r >= wbRoundsDone;
    // The LB final: WB is done, every dropper is folded in, and the pool fits a
    // single lobby that decides who joins the grand final.
    const isLbFinal = wb.complete && noMoreIncoming && pool.length <= rules.lobbySize;

    const chunks = splitLobbies(pool, rules.lobbySize);
    const roundLobbies: Lobby[] = chunks.map((entrants, slot) => {
      const id = `lb-r${lbRound}-s${slot}`;
      return {
        id,
        bracket: "lb" as const,
        round: lbRound,
        slot,
        entrants,
        results: seatResult(results, id, entrants),
      };
    });
    lbLobbies.push(...roundLobbies);
    lbRound++;

    if (roundLobbies.some((l) => !l.results)) {
      lbSurvivors = [];
      stalled = true;
      break; // can't compute further until this round is reported
    }

    lbSurvivors = roundLobbies.flatMap((l) =>
      l.results!.slice(0, perLobbyAdvance(l.entrants.length, rules.advance)),
    );

    if (isLbFinal) {
      lbComplete = true;
      lbFinalists = lbSurvivors;
      break;
    }
    // WB isn't complete yet and there are no more droppers to fold — we can't
    // finalize the losers ladder until the winners bracket resolves.
    if (!wb.complete && r >= wbRoundsDone) break;
  }

  lobbies.push(...lbLobbies);

  // No grand final: the winners champion takes 1st outright and the losers
  // bracket fills the rest — the two ladders never reconverge, so they can run
  // in parallel. (The GF block below is skipped.)
  if (rules.grandFinal === false) return lobbies;

  // Grand final — seats the WB winners + LB finalists, capped at lobbySize.
  if (wb.complete && lbComplete) {
    const gfEntrants = [...wb.winners, ...lbFinalists].slice(0, rules.lobbySize);
    if (gfEntrants.length >= 2) {
      const id = "gf-r0-s0";
      lobbies.push({
        id,
        bracket: "gf",
        round: 0,
        slot: 0,
        entrants: gfEntrants,
        results: seatResult(results, id, gfEntrants),
      });
    }
  }

  return lobbies;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Create a fresh group bracket from a seed-ordered field. */
export function generateGroupBracket(seeds: string[], rules: Partial<GroupRules>): GroupBracket {
  const norm = normalizeRules(rules);
  const seedList = seeds.slice();
  const results: Record<string, string[]> = {};
  return {
    kind: "group_ko",
    rules: norm,
    seeds: seedList,
    results,
    lobbies: build(norm, seedList, results),
  };
}

/** Record (or edit) a lobby's finishing order; recompute the whole tree. The
 *  order must be a permutation of that lobby's current entrants. */
export function reportLobby(bracket: GroupBracket, lobbyId: string, order: string[]): GroupBracket {
  const lobby = bracket.lobbies.find((l) => l.id === lobbyId);
  if (!lobby) return bracket;
  if (!isPermutation(order, lobby.entrants)) return bracket;
  const results = { ...bracket.results, [lobbyId]: order.slice() };
  return { ...bracket, results, lobbies: build(bracket.rules, bracket.seeds, results) };
}

/** Clear a lobby's result (and everything downstream recomputes). */
export function clearLobby(bracket: GroupBracket, lobbyId: string): GroupBracket {
  if (!bracket.results[lobbyId]) return bracket;
  const results = { ...bracket.results };
  delete results[lobbyId];
  return { ...bracket, results, lobbies: build(bracket.rules, bracket.seeds, results) };
}

/** The single terminal lobby of one bracket side, once it's narrowed to one. */
function lastSingleLobby(bracket: GroupBracket, side: LobbyBracket): Lobby | null {
  const ls = bracket.lobbies.filter((l) => l.bracket === side);
  if (!ls.length) return null;
  const maxRound = ls.reduce((m, l) => Math.max(m, l.round), 0);
  const last = ls.filter((l) => l.round === maxRound);
  return last.length === 1 ? last[0] : null;
}

/** The final lobby that decides the champion: the grand final (double + GF), or
 *  the winners-bracket final (single, or double without a grand final). */
export function finalLobby(bracket: GroupBracket): Lobby | null {
  if (hasGrandFinal(bracket.rules)) {
    return bracket.lobbies.find((l) => l.bracket === "gf") ?? null;
  }
  return lastSingleLobby(bracket, "wb");
}

/** Every lobby that needs a full finishing order tapped for placements — the
 *  grand final, or (no-GF double) both bracket finals, or (single) the WB final. */
export function finalLobbies(bracket: GroupBracket): Lobby[] {
  if (hasGrandFinal(bracket.rules)) {
    const gf = bracket.lobbies.find((l) => l.bracket === "gf");
    return gf ? [gf] : [];
  }
  const out: Lobby[] = [];
  const wbf = lastSingleLobby(bracket, "wb");
  if (wbf) out.push(wbf);
  if (bracket.rules.bracketing === "double") {
    const lbf = lastSingleLobby(bracket, "lb");
    if (lbf) out.push(lbf);
  }
  return out;
}

/** Champion id once decided, else null. */
export function groupChampion(bracket: GroupBracket): string | null {
  const fin = finalLobby(bracket);
  return fin?.results?.[0] ?? null;
}

export function isComplete(bracket: GroupBracket): boolean {
  if (groupChampion(bracket) == null) return false;
  // No grand final: the winners champion is known once the WB final is in, but
  // placements aren't done until the losers bracket has also finished. The LB
  // ladder only materializes its next round once the current one is reported, so
  // any unreported LB lobby means it's still running.
  if (bracket.rules.bracketing === "double" && bracket.rules.grandFinal === false) {
    const lbUnfinished = bracket.lobbies.some((l) => l.bracket === "lb" && !l.results);
    if (lbUnfinished) return false;
  }
  return true;
}

/**
 * Final standings. Players are ranked by how far they got: the final lobby's
 * finishing order first, then earlier eliminations by (bracket depth, finishing
 * order). Ties in "how far" are broken by finishing position within the lobby
 * they went out in. Returns 1-based placements.
 */
export function computeGroupPlacements(
  bracket: GroupBracket,
): { participantId: string; placement: number }[] {
  const seen = new Set<string>();
  const depth = (l: Lobby) => (l.bracket === "gf" ? 1000 : l.round);

  // Placements are built as ordered "tiers": every id in a tier shares the same
  // placement, and the next tier starts at (running total + 1). Podium finishers
  // are singleton tiers (distinct places); players eliminated at the same round
  // AND finishing position tie, so a higher finish in one lobby always outranks
  // a lower finish in another (the whole point — no cross-lobby scrambling).
  const tiers: string[][] = [];
  const pushTier = (ids: (string | null | undefined)[]) => {
    const fresh = ids.filter((id): id is string => !!id && !seen.has(id));
    for (const id of fresh) seen.add(id);
    if (fresh.length) tiers.push(fresh);
  };
  const pushDistinct = (ids: (string | null | undefined)[]) => {
    for (const id of ids) pushTier([id]);
  };

  const noGF = bracket.rules.bracketing === "double" && bracket.rules.grandFinal === false;
  const wbFin = lastSingleLobby(bracket, "wb");
  const lbFin = noGF ? lastSingleLobby(bracket, "lb") : null;
  const fin = finalLobby(bracket);
  // The finals we consume explicitly (so the reverse-elimination walk skips them).
  const consumed = new Set<Lobby>();

  if (noGF) {
    // 1st: the winners champion(s) — undefeated, so only the WB final's advancers.
    if (wbFin?.results) {
      pushDistinct(wbFin.results.slice(0, perLobbyAdvance(wbFin.entrants.length, bracket.rules.advance)));
      consumed.add(wbFin);
    }
    // Then the losers bracket fills the rest, its final's full order first.
    if (lbFin?.results) {
      pushDistinct(lbFin.results);
      consumed.add(lbFin);
    }
  } else if (fin?.results) {
    // Grand final / single final: its finishing order is the top of the podium.
    pushDistinct(fin.results);
    consumed.add(fin);
  }

  // Everyone else, latest elimination first. A lobby's non-advancers are
  // "eliminated" there. Group them by (round, finishing position beyond the
  // advancers) so all the 3rd-place finishers across lobbies rank above all the
  // 4th-place finishers, and cross-lobby peers share a placement.
  const groups = new Map<string, { round: number; pos: number; ids: string[] }>();
  const placed = new Set<string>(seen);
  const decided = bracket.lobbies
    .filter((l) => l.results && !consumed.has(l))
    // In double elimination a WB non-advancer DROPS to the losers bracket — it is
    // not eliminated there and reappears in the LB, so only losers-bracket (and
    // single-bracket) non-advancers count as true eliminations. This also stops
    // a dropped player from being counted twice.
    .filter((l) => bracket.rules.bracketing !== "double" || l.bracket !== "wb")
    // Deepest round first so a player is placed at their final elimination.
    .sort((a, b) => depth(b) - depth(a));
  for (const l of decided) {
    const k = perLobbyAdvance(l.entrants.length, bracket.rules.advance);
    l.results!.slice(k).forEach((id, i) => {
      if (placed.has(id)) return;
      placed.add(id);
      const key = `${depth(l)}:${i}`;
      const g = groups.get(key) ?? { round: depth(l), pos: i, ids: [] };
      g.ids.push(id);
      groups.set(key, g);
    });
  }
  [...groups.values()]
    .sort((a, b) => b.round - a.round || a.pos - b.pos)
    .forEach((g) => pushTier(g.ids));

  // Anyone not yet placed (unreported lobbies) — append in seed order.
  pushDistinct(bracket.seeds);

  const out: { participantId: string; placement: number }[] = [];
  let place = 1;
  for (const tier of tiers) {
    for (const id of tier) out.push({ participantId: id, placement: place });
    place += tier.length;
  }
  return out;
}

/** Human label for a lobby, e.g. "Winners · Round 2" / "Losers · Round 1" /
 *  "Grand Final". */
export function lobbyLabel(bracket: GroupBracket, lobby: Lobby): string {
  if (lobby.bracket === "gf") return "Grand Final";
  const side = lobby.bracket === "wb" ? "Winners" : "Losers";
  if (lobby.bracket === "wb" && lobby === finalLobby(bracket)) {
    return bracket.rules.bracketing === "double" ? "Winners · Final" : "Final";
  }
  // The losers bracket's decisive last lobby is the Losers Final.
  if (lobby.bracket === "lb" && lobby === lastSingleLobby(bracket, "lb")) {
    return "Losers · Final";
  }
  return `${side} · Round ${lobby.round + 1}`;
}

/** A plain-English preview of the structure for the create flow, e.g.
 *  "32 players → 8 lobbies of 4 → top 2 advance → …". */
export function describeStructure(rules: Partial<GroupRules>, fieldSize: number): string {
  const r = normalizeRules(rules);
  if (fieldSize < 2) return "Add at least 2 players.";
  const steps: string[] = [`${fieldSize} players`];
  let pool = fieldSize;
  let guard = 0;
  while (pool > r.lobbySize && guard++ < 12) {
    const num = lobbyCount(pool, r.lobbySize);
    const moveOn = r.advance === 1 ? "the winner moves on" : `the top ${r.advance} move on`;
    steps.push(`${num} ${num === 1 ? "lobby" : "lobbies"} of ~${Math.round(pool / num)}, ${moveOn}`);
    // Approximate next pool (even split).
    pool = num * r.advance;
  }
  steps.push(`a final lobby of ${pool} for the podium`);
  let tail = "";
  if (r.bracketing === "double") {
    tail = r.grandFinal === false
      ? " Everyone else gets a second chance in a lower bracket; the winners champion takes 1st and the lower bracket fills the rest (no grand final)."
      : " Everyone else gets a second chance in a lower bracket, then the two meet in a grand final.";
  }
  return steps.join(" → ") + "." + tail;
}
