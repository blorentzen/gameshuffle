import type { PartyCard } from "@/data/party/cards";

/**
 * Wheel of Consequences (a GameShuffle Original). After a game, the winner
 * spins for a handicap and/or last place spins for a perk, for the next game
 * only. They ride on house-rule cards (kind "rule", scope "player", ids "wc-"),
 * so everyone sees them, the overlay shows them, and starting the next game
 * clears them.
 *
 * `title` is the wheel label: keep it to 13 characters or it clips on the wheel. Everything
 * should be something the table can see being followed.
 */

const MK = ["mario-kart-8-deluxe", "mario-kart-world"];

export const CONSEQUENCE_PREFIX = "wc-";

export const HANDICAPS: PartyCard[] = [
  { id: "wc-h-01", kind: "rule", scope: "player", title: "One hand only", text: "{player} plays the next game one-handed." },
  { id: "wc-h-02", kind: "rule", scope: "player", title: "Swap seats", text: "{player} swaps seats (and controllers) with last place for the next game." },
  { id: "wc-h-03", kind: "rule", scope: "player", title: "Room picks", text: "The rest of the table picks {player}'s character for the next game." },
  { id: "wc-h-04", kind: "rule", scope: "player", title: "Slow start", text: "{player} waits until everyone else has moved before making their first move." },
  { id: "wc-h-05", kind: "rule", scope: "player", title: "Silent game", text: "{player} can't talk during the next game. Every word is a point for the table to laugh at." },
  { id: "wc-h-06", kind: "rule", scope: "player", title: "Standing up", text: "{player} plays the whole next game standing up." },
  { id: "wc-h-07", kind: "rule", scope: "player", title: "Wrong hands", text: "{player} holds the controller with their hands crossed for the next game." },
  { id: "wc-h-08", kind: "rule", scope: "player", title: "No snacks", text: "{player} can't touch the snack table until the next game is over." },
  { id: "wc-h-09", kind: "rule", scope: "player", games: MK, title: "No drifting", text: "{player} can't drift in the next race." },
  { id: "wc-h-10", kind: "rule", scope: "player", games: MK, title: "Heaviest kart", text: "{player} must use the heaviest character and kart they can find." },
  { id: "wc-h-11", kind: "rule", scope: "player", games: MK, title: "Items for all", text: "{player} has to use every item the moment they get it." },
  { id: "wc-h-12", kind: "rule", scope: "player", games: MK, title: "Late start", text: "{player} can't accelerate until the countdown hits GO plus a full second." },
];

export const PERKS: PartyCard[] = [
  { id: "wc-p-01", kind: "rule", scope: "player", title: "First pick", text: "{player} picks their character first for the next game." },
  { id: "wc-p-02", kind: "rule", scope: "player", title: "You choose", text: "{player} chooses the track, board or map for the next game." },
  { id: "wc-p-03", kind: "rule", scope: "player", title: "Curse someone", text: "{player} gives any other player a one-game handicap of their choice." },
  { id: "wc-p-04", kind: "rule", scope: "player", title: "Head start", text: "{player} gets to move first in the next game." },
  { id: "wc-p-05", kind: "rule", scope: "player", title: "Swap pads", text: "{player} picks two other players who have to swap controllers." },
  { id: "wc-p-06", kind: "rule", scope: "player", title: "Coach", text: "{player} can shout instructions at anyone for the next game, and they have to try them." },
  { id: "wc-p-07", kind: "rule", scope: "player", title: "Snack tax", text: "The winner of the last game brings {player} a snack." },
  { id: "wc-p-08", kind: "rule", scope: "player", title: "Veto", text: "{player} can veto one choice another player makes in the next game." },
  { id: "wc-p-09", kind: "rule", scope: "player", games: MK, title: "Item picker", text: "{player} picks the item setting for the next race." },
  { id: "wc-p-10", kind: "rule", scope: "player", games: MK, title: "Lightest only", text: "Everyone except {player} has to use a light character." },
];

export const CONSEQUENCES: PartyCard[] = [...HANDICAPS, ...PERKS];

export function isConsequence(cardId: string): boolean {
  return cardId.startsWith(CONSEQUENCE_PREFIX);
}

export function consequenceKind(cardId: string): "handicap" | "perk" | null {
  return cardId.startsWith("wc-h-") ? "handicap" : cardId.startsWith("wc-p-") ? "perk" : null;
}

export function consequencesFor(kind: "handicap" | "perk", gameSlug: string): PartyCard[] {
  return (kind === "handicap" ? HANDICAPS : PERKS).filter((c) => !c.games || c.games.includes(gameSlug));
}

/** A small deterministic generator, so every screen draws the same wheel for one spin. */
function seeded(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** The wheel shown for a spin: the result plus up to 7 others from the same pool, same for everyone. */
export function wheelFor(cardId: string, spinId: string, gameSlug: string): { labels: string[]; winningIndex: number } {
  const kind = consequenceKind(cardId) ?? "handicap";
  const pool = consequencesFor(kind, gameSlug);
  const winner = pool.find((c) => c.id === cardId) ?? CONSEQUENCES.find((c) => c.id === cardId);
  const rand = seeded(spinId);
  const others = pool.filter((c) => c.id !== cardId);
  for (let i = others.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [others[i], others[j]] = [others[j], others[i]]; }
  const picks = others.slice(0, 7);
  const winningIndex = Math.floor(rand() * (picks.length + 1));
  picks.splice(winningIndex, 0, winner ?? pool[0]);
  return { labels: picks.map((c) => c.title), winningIndex };
}
