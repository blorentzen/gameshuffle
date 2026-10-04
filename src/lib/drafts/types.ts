/**
 * Chat drafts: chat fills a streamer's slots one pick at a time by voting.
 * The engine (src/lib/drafts/store.ts) knows nothing about any game; a pool
 * says what the slots are and what can fill each one. Adding a new kind of
 * draft is a new pool, not a migration. Client-safe.
 */

/** One thing chat can pick. `label` is unique within its slot (votes map back by label). */
export interface DraftOption { id: string; label: string; detail?: string; tags?: string[] }

export interface DraftSlot { key: string; label: string }

/** A rule the streamer can switch on or off when starting (e.g. "Fully evolved only"). */
export interface DraftRuleDef { id: string; label: string; default: boolean }

export type DraftRules = Record<string, boolean>;

export interface DraftPick extends DraftOption { slot: string }

export interface DraftPool {
  id: string;
  /** "Pokémon Scarlet and Violet team" */
  label: string;
  game: string;
  rules: DraftRuleDef[];
  slots(rules: DraftRules): DraftSlot[];
  /** Everything that could fill this slot right now, given the rules and the picks so far. */
  candidates(slot: DraftSlot, rules: DraftRules, picks: DraftPick[]): DraftOption[];
  /** Looks an offered option back up by its label once the vote closes. */
  lookup(slot: DraftSlot, label: string): DraftOption | null;
  /** The poll question for a pick, e.g. "Pick 2 of 6: who joins the team?" */
  question(slot: DraftSlot, index: number, total: number): string;
}

export function withDefaults(pool: Pick<DraftPool, "rules">, rules: DraftRules | null | undefined): DraftRules {
  const out: DraftRules = {};
  for (const r of pool.rules) out[r.id] = typeof rules?.[r.id] === "boolean" ? rules[r.id] : r.default;
  return out;
}
