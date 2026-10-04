import mk8dx from "@/data/mk8dx-data.json";
import mkworld from "@/data/mkworld-data.json";
import { PARTY_GAMES } from "@/data/party";
import { characterArt } from "@/lib/party/types";
import { ULTIMATE } from "@/data/smash/ultimate";
import { SMASH_PUBLIC } from "@/lib/games-visibility";

/**
 * Draft Night rules (a GameShuffle Original). Pure and client-safe.
 *
 * The table snake-drafts characters from one game's roster on their phones;
 * each player then plays only from their own pool for the rest of the night.
 * A pick clock keeps it moving: when it runs out, a random free character is
 * picked for whoever's up.
 */

export const PICK_SECONDS = 45;
export const MIN_PICKS = 2;
export const MAX_PICKS = 5;
export const DEFAULT_PICKS = 3;

export interface DraftItem { name: string; img?: string }
export interface DraftRoster { slug: string; label: string; items: DraftItem[] }

type Named = { name: string; img: string };

/** Rosters a draft can use, with art. */
export function draftRosters(): DraftRoster[] {
  const out: DraftRoster[] = [
    { slug: "mario-kart-8-deluxe", label: "Mario Kart 8 Deluxe characters", items: ((mk8dx as { characters?: Named[] }).characters ?? []).map((c) => ({ name: c.name, img: c.img })) },
    { slug: "mario-kart-world", label: "Mario Kart World characters", items: ((mkworld as unknown as { characters?: Named[] }).characters ?? []).map((c) => ({ name: c.name, img: c.img })) },
    ...Object.values(PARTY_GAMES).map((g) => ({
      slug: g.slug, label: `${g.label} characters`,
      items: g.characters.map((c) => ({ name: c.name, img: characterArt(g, c) })),
    })),
  ];
  if (SMASH_PUBLIC) {
    out.push({ slug: ULTIMATE.slug, label: "Smash Ultimate fighters", items: ULTIMATE.fighters.map((f) => ({ name: f.name, img: ULTIMATE.artReady ? `${ULTIMATE.assetBase}${f.img}` : undefined })) });
  }
  return out.filter((r) => r.items.length > 0);
}

export function draftRoster(slug: string): DraftRoster | null {
  return draftRosters().find((r) => r.slug === slug) ?? null;
}

export interface DraftPick { seat: number; name: string }

export interface DraftState {
  roster: string;
  picks: number;
  /** Seats in first-round order; the snake reverses every other round. */
  order: number[];
  taken: DraftPick[];
  /** When the current pick's clock started (ISO). */
  turnStartedAt: string;
  phase: "drafting" | "done";
}

export function startDraft(players: number[], roster: string, picks: number, now: string, rand: () => number = Math.random): DraftState {
  const order = [...players];
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  return { roster, picks: Math.max(MIN_PICKS, Math.min(MAX_PICKS, Math.floor(picks))), order, taken: [], turnStartedAt: now, phase: "drafting" };
}

/** Whose pick it is (null once the draft is over). */
export function onTheClock(s: DraftState): number | null {
  const n = s.order.length;
  const i = s.taken.length;
  if (s.phase === "done" || !n || i >= n * s.picks) return null;
  const round = Math.floor(i / n);
  const pos = i % n;
  return round % 2 === 0 ? s.order[pos] : s.order[n - 1 - pos];
}

/** Record a pick; returns the next state or an error code. */
export function makePick(s: DraftState, seat: number, name: string, now: string): DraftState | "not_your_pick" | "taken" | "not_in_roster" {
  if (onTheClock(s) !== seat) return "not_your_pick";
  const roster = draftRoster(s.roster);
  const item = roster?.items.find((it) => it.name === name);
  if (!item) return "not_in_roster";
  if (s.taken.some((t) => t.name === name)) return "taken";
  const taken = [...s.taken, { seat, name }];
  const done = taken.length >= s.order.length * s.picks;
  return { ...s, taken, turnStartedAt: now, phase: done ? "done" : "drafting" };
}

/** A random free character, for a pick whose clock ran out. */
export function autoPickName(s: DraftState, rand: () => number = Math.random): string | null {
  const free = (draftRoster(s.roster)?.items ?? []).filter((it) => !s.taken.some((t) => t.name === it.name));
  return free.length ? free[Math.floor(rand() * free.length)].name : null;
}

export function clockExpired(s: DraftState, nowMs: number): boolean {
  return nowMs - Date.parse(s.turnStartedAt) >= PICK_SECONDS * 1000;
}

/** Each seat's pool, in pick order. */
export function pools(s: DraftState): Record<number, string[]> {
  const out: Record<number, string[]> = {};
  for (const t of s.taken) (out[t.seat] ??= []).push(t.name);
  return out;
}
