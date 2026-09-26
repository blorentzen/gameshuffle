/**
 * Turning what an organizer knows about the field into an ordered seed list.
 *
 * Pure, and deliberately separate from PLACEMENT. Every method here produces
 * the same thing, seeds 1..N in order; `seedOrder()` in bracket.ts and
 * `splitHeats()` in heatMains.ts decide where those seeds sit in a format. Two
 * concerns, two places, so a new method cannot break a bracket.
 *
 * REPRODUCIBILITY IS THE POINT. A random draw that cannot be re-run is
 * indistinguishable from a rigged one. Every shuffle goes through a seeded RNG,
 * the seed string is stored on the tournament, and the same seed with the same
 * inputs gives the same draw forever. That is what lets an organizer answer
 * "why is he seed 1" with something better than a shrug.
 */

export type SeedingMethod = "random" | "manual" | "protected" | "tiered" | "standings";
export type Tier = "A" | "B" | "C";

export interface SeedableEntrant {
  id: string;
  /** Entry order, the tie-break of last resort so a draw is never ambiguous. */
  joinedAt?: string | null;
  tier?: Tier | null;
  /** 1-based pin for Protected; null for everyone else. */
  protectedRank?: number | null;
  /** Position in the championship standings, 1 = leader. Null for unranked. */
  standingsRank?: number | null;
  /** Explicit order for Manual, 1-based. */
  manualSeed?: number | null;
}

export interface SeedingOptions {
  method: SeedingMethod;
  /** Any string. Stored on the tournament so the draw can be reproduced. */
  rng: string;
  /** Protected only: how many seats the organizer pins. */
  protectedCount?: number;
}

/* ── Deterministic RNG ─────────────────────────────────────────────────────
   xmur3 to turn the seed string into a 32-bit state, then mulberry32. Small,
   well-known, and stable across Node versions, which matters: a draw has to
   reproduce in a year, not just this week. Math.random cannot do that. */

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rngFrom(seed: string): () => number {
  return mulberry32(xmur3(seed)());
}

/** Fisher-Yates, so every ordering is equally likely. A sort with a random
 *  comparator is NOT a shuffle and biases badly; it is the classic version of
 *  this bug and worth not repeating. */
function shuffle<T>(items: T[], rand: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Entry order, then id. Keeps any tie deterministic rather than depending on
 *  whatever order the database handed us. */
function byEntry(a: SeedableEntrant, b: SeedableEntrant): number {
  const at = a.joinedAt ? Date.parse(a.joinedAt) : Number.POSITIVE_INFINITY;
  const bt = b.joinedAt ? Date.parse(b.joinedAt) : Number.POSITIVE_INFINITY;
  return at - bt || a.id.localeCompare(b.id);
}

/**
 * The seed list, strongest first.
 *
 * Returns participant ids. Index 0 is seed 1.
 */
export function buildSeedList(entrants: SeedableEntrant[], opts: SeedingOptions): string[] {
  const rand = rngFrom(opts.rng);
  const field = entrants.slice().sort(byEntry);

  switch (opts.method) {
    case "manual": {
      // Anyone the organizer ordered, in that order; everyone else beneath, in
      // entry order. Never silently reshuffled: a manual order is a decision.
      const ordered = field.filter((e) => e.manualSeed != null)
        .sort((a, b) => (a.manualSeed ?? 0) - (b.manualSeed ?? 0));
      const rest = field.filter((e) => e.manualSeed == null);
      return [...ordered, ...rest].map((e) => e.id);
    }

    case "protected": {
      const count = Math.max(1, Math.min(8, opts.protectedCount ?? 2));
      const pinned = field.filter((e) => e.protectedRank != null)
        .sort((a, b) => (a.protectedRank ?? 0) - (b.protectedRank ?? 0))
        .slice(0, count);
      const pinnedIds = new Set(pinned.map((e) => e.id));
      const rest = shuffle(field.filter((e) => !pinnedIds.has(e.id)), rand);
      return [...pinned, ...rest].map((e) => e.id);
    }

    case "tiered": {
      // Untagged counts as B, so an organizer can tag only the few they are
      // sure about and the rest land in the middle.
      const of = (t: Tier) => shuffle(field.filter((e) => (e.tier ?? "B") === t), rand);
      return [...of("A"), ...of("B"), ...of("C")].map((e) => e.id);
    }

    case "standings": {
      const ranked = field.filter((e) => e.standingsRank != null)
        .sort((a, b) => (a.standingsRank ?? 0) - (b.standingsRank ?? 0));
      // New to the series goes below everyone ranked, shuffled among themselves,
      // rather than being treated as worst.
      const unranked = shuffle(field.filter((e) => e.standingsRank == null), rand);
      return [...ranked, ...unranked].map((e) => e.id);
    }

    case "random":
    default:
      return shuffle(field, rand).map((e) => e.id);
  }
}

/** A fresh RNG seed. Timestamped so a log of draws reads in order at a glance. */
export function newRngSeed(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Tiered can be pre-filled from organizer tags. SUGGESTS only: the spec is
 *  explicit that nothing is applied without the organizer confirming. */
export function suggestTierFromTags(tags: string[] | null | undefined): Tier | null {
  if (!tags?.length) return null;
  if (tags.includes("Strong player")) return "A";
  if (tags.includes("New to the game")) return "C";
  return null;
}
